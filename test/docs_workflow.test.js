/**
 * Docs workflow guard
 *
 * `.github/workflows/docs.yml` used to require a GitHub Pages site that only a
 * human can provision: `actions/configure-pages` with `enablement: true` issues
 * the *create* call, and the workflow token is never allowed to make it. Run
 * 42344720510 is the evidence: reading the Pages API returned 404 (the read
 * was authorised, the site simply does not exist) while the create call
 * answered:
 *
 *   Create Pages site failed. Error: Resource not accessible by integration
 *
 * So the workflow gets by without a site: probe read-only, name the setting,
 * gate every Pages step on the probe. A site *existing* is not enough either:
 * `/repos/{repo}/pages` answers 200 for a site still on "Deploy from a branch"
 * (build_type "legacy"), which `actions/deploy-pages` cannot deploy, so ready
 * is reserved for build_type "workflow". Each rule below is proven able to fail
 * by mutating this repo's own docs.yml in the way it exists to catch.
 *
 * No rule may key on something outside what it guards: the ordering rule is
 * anchored on the probe's own `id:` line and on the docs build command, so
 * renaming a neighbouring step cannot switch it off.
 */

import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(repoRoot, ".github", "workflows", "docs.yml");
const workflow = readFileSync(workflowPath, "utf8");

/** The one human step this workflow cannot perform, quoted verbatim. */
const SETTING =
  'Settings > Pages > Build and deployment > Source = "GitHub Actions"';
const READY_AT = "steps.pages-site.outputs.ready";
const PAGES_GATE = "if: " + READY_AT + " == 'true'";
const DEPLOY_GATE = "if: needs.build.outputs.pagesReady == 'true'";
const READY_OUTPUT = "pagesReady: " + "${{ " + READY_AT + " }}";
/** A 200 alone is not readiness: only an Actions-built site can be deployed. */
const BUILT_BY_ACTIONS = '[ "${build_type}" = "workflow" ]';

/** The `- ` list item containing `needle`, or null. */
function stepBlock(lines, needle) {
  const index = lines.findIndex((line) => line.trim().startsWith(needle));
  if (index === -1) return null;

  let start = index;
  while (start > 0 && !/^\s*- /.test(lines[start])) start--;
  if (!/^\s*- /.test(lines[start])) return null;

  const indent = lines[start].match(/^\s*/)[0].length;
  let end = lines.length;

  for (let i = start + 1; i < lines.length; i++) {
    const item = lines[i].match(/^(\s*)- /);
    if (item && item[1].length <= indent) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end);
}

/** The `<name>:` job and everything nested under it, or null. */
function jobBlock(lines, name) {
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) return null;

  let end = lines.length;

  // A job key sits at 2 spaces; the next workflow-level key at column 0.
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {0,2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end);
}

/** The entries of the `<key>:` mapping inside `block`, or null when absent. */
function entriesUnder(block, key) {
  const at = block.findIndex((line) => line.trim() === `${key}:`);
  if (at === -1) return null;

  const indent = block[at].match(/^\s*/)[0].length;
  const entries = [];

  for (const line of block.slice(at + 1)) {
    if (line.trim() === "") continue;

    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent <= indent) break;

    entries.push(line.trim());
  }

  return entries;
}

/** Every rule this workflow has to keep, checked against `text`. */
function collect(text) {
  const lines = text.split("\n");
  const found = [];
  const note = (rule, detail) => found.push(`${rule}: ${detail}`);

  // The access-denied create call cannot come back.
  if (text.includes("configure-pages") || text.includes("enablement:")) {
    note(
      "pages-setup",
      "docs.yml provisions a Pages site — that call is the 403",
    );
  }

  // A check that can be silenced is not a check.
  if (text.includes("continue-on-error")) {
    note("silenced", "docs.yml can skip a step with continue-on-error");
  }

  // Pages write is the deploy job's alone; repo-wide is how the create call
  // became reachable.
  if (/^permissions:/m.test(text)) {
    note("workflow-permissions", "Pages permissions belong to the deploy job");
  }

  const probe = stepBlock(lines, "id: pages-site");
  const build = jobBlock(lines, "build");
  const deploy = jobBlock(lines, "deploy");

  if (!probe) {
    note("probe-missing", "no step declares `id: pages-site`");
  } else {
    if (!probe[0].includes(SETTING)) {
      note("probe-setting", `the probe step's name does not name ${SETTING}`);
    }

    // The setting must reach the run log as an annotation, not only the step
    // title: that warning is how the operator learns why the deploy was
    // skipped.
    const annotated = probe.some(
      (line) => line.includes("::warning") && line.includes(SETTING),
    );
    if (!annotated) {
      note(
        "probe-annotation",
        "no `::warning` names the setting in the run log",
      );
    }

    // Only executed shell counts: a `#` comment inside the run block is
    // commentary, not code, so it must not be able to satisfy a rule — a
    // dropped condition would otherwise hide behind a descriptive comment.
    const probeLines = probe.filter((line) => !line.trim().startsWith("#"));
    const probeText = probeLines.join("\n");

    // Both branches publish the verdict — to the right one. The then branch
    // writes ready=true and the else branch ready=false; swapping them leaves
    // the gates green while a site-less (or not-Actions-built) run uploads the
    // Pages artifact and deploys, the red run this workflow exists to avoid.
    const branches = probeLines.reduce(
      (at, line) => {
        if (line.includes("ready=true")) at.then = true;
        if (line.includes("ready=false")) at.writeFalse = true;
        if (/^\s*else\s*$/.test(line)) at.sees_else = true;
        if (at.then && at.sees_else && !at.writeFalse)
          at.true_before_else = true;
        return at;
      },
      {
        then: false,
        writeFalse: false,
        sees_else: false,
        true_before_else: false,
      },
    );
    const published =
      ["ready=true", "ready=false", "GITHUB_OUTPUT"].every((part) =>
        probeText.includes(part),
      ) &&
      branches.then &&
      branches.writeFalse &&
      branches.true_before_else;
    if (!published) {
      note(
        "probe-output",
        "the probe does not write ready=true before `else` and ready=false after it to $GITHUB_OUTPUT",
      );
    }

    // A site existing is not the property this gate needs. `/repos/{repo}/pages`
    // answers 200 for a site left on "Deploy from a branch" (build_type
    // "legacy"), and actions/deploy-pages cannot deploy that site: ready must
    // hang on build_type "workflow", which means the probe has to read the body
    // instead of discarding it. Anchored on the condition, not on any mention of
    // build_type, so the explanatory comments cannot satisfy it.
    if (!probeText.includes(BUILT_BY_ACTIONS)) {
      note(
        "probe-build-type",
        'the probe does not require build_type "workflow"',
      );
    }

    // A missing site must be reported before the docs build, not at the
    // deploy. The probe's own `id:` line anchors its position and the docs
    // build is found by the command it runs, so renaming a step cannot
    // switch the rule off.
    const probeAt = lines.indexOf(probe[0]);
    const buildAt = lines.findIndex((line) =>
      line.includes("bun run docs:build"),
    );
    if (buildAt !== -1 && probeAt > buildAt) {
      note("probe-order", "the Pages probe runs after the docs build");
    }
  }

  if (!build) {
    note("build-job", "docs.yml has no `build` job");
  } else {
    // A read-only build token: this, not an action pin, is what makes the
    // create call unreachable.
    const scopes = (entriesUnder(build, "permissions") ?? []).join(",");
    if (scopes !== "contents: read,pages: read") {
      note("build-permissions", `the build job holds "${scopes}"`);
    }

    if (!build.join("\n").includes("bun run docs:build")) {
      note("docs-build", "the build job does not run `bun run docs:build`");
    }

    // The verdict has to leave the job, or the deploy cannot read it.
    const outputs = entriesUnder(build, "outputs") ?? [];
    if (!outputs.includes(READY_OUTPUT)) {
      note("build-output", "the build job does not expose `pagesReady`");
    }

    // The site is still built and kept when Pages is unavailable.
    const docsArtifact = stepBlock(build, "uses: actions/upload-artifact@");
    if (!docsArtifact) {
      note("docs-artifact", "the build job does not keep the built site");
    } else if (docsArtifact.some((line) => line.trim().startsWith("if:"))) {
      note("docs-artifact", "the plain artifact upload is conditional");
    }

    const pagesArtifact = stepBlock(
      build,
      "uses: actions/upload-pages-artifact@",
    );
    if (!pagesArtifact) {
      note("pages-artifact-gate", "the build job has no Pages artifact upload");
    } else if (!pagesArtifact.some((line) => line.trim() === PAGES_GATE)) {
      note(
        "pages-artifact-gate",
        `the Pages artifact upload lacks \`${PAGES_GATE}\``,
      );
    }
  }

  if (!deploy) {
    note("deploy-job", "docs.yml no longer deploys to Pages");
  } else {
    if (!deploy.join("\n").includes("uses: actions/deploy-pages@")) {
      note("deploy-job", "the deploy job does not use actions/deploy-pages");
    }

    if (!deploy.some((line) => line.trim() === DEPLOY_GATE)) {
      note("deploy-gate", `the deploy job lacks \`${DEPLOY_GATE}\``);
    }

    // Only the deploy job writes to Pages, and it signs the deployment.
    const scopes = (entriesUnder(deploy, "permissions") ?? []).join(",");
    if (scopes !== "pages: write,id-token: write") {
      note("deploy-permissions", `the deploy job holds "${scopes}"`);
    }
  }

  return found;
}

const rules = (text) => collect(text).map((problem) => problem.split(":")[0]);

/** Applies one mutation, insisting it matched — a stale anchor must not pass. */
function mutate(from, to) {
  expect(workflow).toContain(from);

  const mutated = workflow.replace(from, to);
  expect(mutated).not.toBe(workflow);

  return mutated;
}

test("the committed docs workflow satisfies every rule", () => {
  expect(collect(workflow)).toEqual([]);
});

const MUTATIONS = [
  [
    "pages-setup",
    "      - name: Build documentation",
    "      - name: Setup Pages\n        uses: actions/configure-pages@v6.0.0\n\n      - name: Build documentation",
  ],
  [
    "pages-setup",
    "          bun-version: latest\n",
    "          bun-version: latest\n\n      - name: Enable Pages\n        enablement: true\n",
  ],
  [
    "silenced",
    "        run: bun run docs:build",
    "        continue-on-error: true\n        run: bun run docs:build",
  ],
  [
    "workflow-permissions",
    "concurrency:\n  group: pages",
    "permissions:\n  pages: write\n\nconcurrency:\n  group: pages",
  ],
  [
    "build-permissions",
    "      contents: read\n      pages: read",
    "      contents: read\n      pages: write",
  ],
  // The artifact the Pages upload reads is never produced.
  ["docs-build", "        run: bun run docs:build\n", ""],
  // The job every other rule and the deploy gate hang on is renamed away.
  ["build-job", "  build:\n", "  compile:\n"],
  ["probe-missing", "        id: pages-site\n", ""],
  [
    "probe-setting",
    `      - name: 'Check Pages site - if the deploy is skipped, set ${SETTING}'`,
    "      - name: Check Pages site",
  ],
  [
    "probe-annotation",
    "echo '::warning title=Pages site not provisioned::GitHub Pages is not deployable for '",
    "echo 'Notice: GitHub Pages is not deployable for '",
  ],
  [
    "probe-output",
    '            echo "ready=false" >> "$GITHUB_OUTPUT"',
    '            echo "no site"',
  ],
  // The writes are swapped: the else branch answers ready=true, so a site-less
  // run still uploads the Pages artifact and deploys — the red run this
  // workflow exists to avoid.
  [
    "probe-output",
    '            echo "ready=true" >> "$GITHUB_OUTPUT"\n            echo "GitHub Pages site found for ${GH_REPO} (build_type ${build_type}) - the deploy will run."\n          else\n            echo "ready=false" >> "$GITHUB_OUTPUT"',
    '            echo "ready=false" >> "$GITHUB_OUTPUT"\n            echo "GitHub Pages site found for ${GH_REPO} (build_type ${build_type}) - the deploy will run."\n          else\n            echo "ready=true" >> "$GITHUB_OUTPUT"',
  ],
  // The body is discarded again: a site on "Deploy from a branch" answers 200,
  // so a status-only probe ships a green deploy step it cannot run.
  [
    "probe-build-type",
    '          if [ "${status}" = "200" ] && ' + BUILT_BY_ACTIONS + "; then",
    '          if [ "${status}" = "200" ]; then',
  ],
  // The docs build is renamed AND moved ahead of the probe: an ordering rule
  // anchored on the `Build documentation` step name would find no build step
  // and pass this silently.
  [
    "probe-order",
    "      - name: Install dependencies",
    "      - name: Compile the site\n        run: bun run docs:build\n\n      - name: Install dependencies",
  ],
  [
    "build-output",
    READY_OUTPUT,
    "pagesReady: " + "${{ steps.other.outputs.ready }}",
  ],
  [
    "docs-artifact",
    "      - name: Upload docs artifact\n        uses: actions/upload-artifact@",
    `      - name: Upload docs artifact\n        ${PAGES_GATE}\n        uses: actions/upload-artifact@`,
  ],
  ["pages-artifact-gate", `        ${PAGES_GATE}\n`, ""],
  ["deploy-gate", `    ${DEPLOY_GATE}\n`, ""],
  [
    "deploy-job",
    "        uses: actions/deploy-pages@",
    "        run: echo no-deploy",
  ],
  [
    "deploy-permissions",
    "      pages: write\n      id-token: write",
    "      contents: read",
  ],
];

for (const [index, [rule, from, to]] of MUTATIONS.entries()) {
  test(`${rule} fails on mutation ${index + 1}, and alone`, () => {
    expect(rules(mutate(from, to))).toEqual([rule]);
  });
}
