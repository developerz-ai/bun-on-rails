/**
 * Which workflows run on a push to a given branch, read structurally from each
 * workflow's `on:` triggers.
 *
 * bin/qa-release (bar 4, "CI green on main") runs this inside the pinned
 * oven/bun container: `bun bin/lib/push-workflows.js <workflows-dir> [branch]`
 * prints one file name per line. Pinned by test/bin/push_workflows.test.js.
 *
 * A workflow that cannot be parsed throws: a checker that skipped what it could
 * not read would report CI green on workflows it never looked at.
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * GitHub branch-filter glob to RegExp: `*` stops at `/`, `**` does not, `?` is
 * one character.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * GitHub filter semantics: patterns apply in order, a `!pattern` excludes, and
 * the last pattern that matches decides.
 *
 * @param {string[]} patterns
 * @param {string} branch
 * @returns {boolean}
 */
function matchesFilter(patterns, branch) {
  let hit = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    if (globToRegExp(negated ? pattern.slice(1) : pattern).test(branch)) {
      hit = !negated;
    }
  }
  return hit;
}

/**
 * Does a parsed workflow run on a push to `branch`?
 *
 * @param {object} workflow - the parsed workflow document
 * @param {string} branch
 * @returns {boolean}
 */
export function triggersOnPush(workflow, branch) {
  // A YAML 1.1 parser reads a bare `on` key as boolean true.
  let on = workflow?.on ?? workflow?.[true];
  if (typeof on === "string") on = [on];
  if (Array.isArray(on))
    on = Object.fromEntries(on.map((event) => [event, null]));
  if (!on || typeof on !== "object" || !("push" in on)) return false;

  const push = on.push ?? {};
  if (push.branches) return matchesFilter([].concat(push.branches), branch);
  if (push["branches-ignore"])
    return !matchesFilter([].concat(push["branches-ignore"]), branch);
  // A push filter on tags alone never fires for a branch push.
  return !(push.tags || push["tags-ignore"]);
}

/**
 * The workflow files in `dir` that run on a push to `branch`, sorted.
 *
 * @param {string} dir
 * @param {string} branch
 * @returns {string[]}
 */
export function pushWorkflows(dir, branch) {
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .filter((file) => {
      const path = join(dir, file);
      let workflow;
      try {
        workflow = Bun.YAML.parse(readFileSync(path, "utf8"));
      } catch (error) {
        throw new Error(`cannot parse workflow ${path}: ${error.message}`);
      }
      return triggersOnPush(workflow, branch);
    });
}

if (import.meta.main) {
  const [dir, branch = "main"] = process.argv.slice(2);
  if (!dir) {
    console.error(
      "usage: bun bin/lib/push-workflows.js <workflows-dir> [branch]",
    );
    process.exit(2);
  }
  console.log(pushWorkflows(dir, branch).join("\n"));
}
