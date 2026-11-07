/**
 * CI parity guard
 *
 * `bin/check` is the one-command gate; CI runs the same gate commands as
 * separate steps in `.github/workflows/ci.yml`. This test pins that
 * alignment: every non-setup `run:` step of the workflow must appear in
 * bin/check's &&-chain with the same working directory — so a gate CI runs
 * cannot silently go missing from the local gate.
 *
 * The parser itself is pinned by the fixture workflows below: the real
 * workflow happens to use only one step shape, so a parser that silently
 * drops what it cannot read would still pass against it. A gate the parser
 * cannot read must fail LOUD (thrown error or reported as missing), never
 * fail open.
 *
 * "Non-empty" is not enough on its own: a job whose whole gate list the
 * parser skipped leaves the OTHER jobs' gates to keep the comparison
 * non-empty, so the guard passes on a workflow it only half read. Every
 * shape the parser cannot read is refused instead — and the multi-job
 * fixture below proves a skipped job is caught.
 */

import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";


const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const workflowPath = join(repoRoot, ".github", "workflows", "ci.yml");
const checkPath = join(repoRoot, "bin", "check");

// `bun install` is environment setup, not a gate.
const SETUP_COMMAND = "bun install";

// --- Fixture workflows -----------------------------------------------------
// One miniature workflow per parser path that the real ci.yml does not
// exercise. They keep the parser honest: deleting a branch of the parser
// turns one of these into a failure.

/** A step in the demo directory next to the same command at the root. */
const FIXTURE_WORKING_DIRECTORIES = `name: CI
jobs:
  demo:
    steps:
      - name: Lint demo
        run: bun lint
        working-directory: demo
      - name: Lint root
        run: bun lint
`;

/** A step whose key IS `run` — the command sits on the step line itself. */
const FIXTURE_BARE_RUN_STEP = `name: CI
jobs:
  build:
    steps:
      - name: Build
        run: bun run build
      - run: bun run docs:build
      - run: bun lint
        working-directory: demo
`;

/** A block scalar: the command spans several lines and cannot be read. */
const FIXTURE_MULTI_LINE_RUN = `name: CI
jobs:
  build:
    steps:
      - name: Build
        run: |
          bun run build
          bun run docs:build
`;

/**
 * A FIRST step headed by `- id:` — a step may start with any key, so the
 * parser must not assume `- name:`/`- uses:`.
 */
const FIXTURE_ID_FIRST_STEP = `name: CI
jobs:
  audit:
    steps:
      - id: audit
        run: bun run audit
`;

/**
 * Two steps in a row headed by `- id:` — the second one's `run:` overwrote
 * the first one's command, so all but the last gate vanished from the
 * comparison.
 */
const FIXTURE_ID_STEPS = `name: CI
jobs:
  audit:
    steps:
      - id: lint
        run: bun lint
      - id: test
        run: bun test
`;

/**
 * TWO jobs, and the first one's `steps:` header carries a trailing
 * comment. A parser that skips a header it cannot read drops that job's
 * whole gate list — the other job's gates keep the parse non-empty, so
 * the guard still passes on a workflow it only half read.
 */
const FIXTURE_MULTI_JOB_COMMENT_HEADER = `name: CI
jobs:
  framework:
    steps: # checks
      - name: Audit
        run: bun run audit
  demo:
    steps:
      - name: Lint demo
        run: bun lint
        working-directory: demo
`;

/** A `steps:` header carrying a value this parser cannot read. */
const FIXTURE_UNSUPPORTED_STEPS_HEADER = `name: CI
jobs:
  framework:
    steps: [{ run: bun lint }]
`;

/** A `run:` key the parser reads into the wrong step — a command it cannot place. */
const FIXTURE_UNREADABLE_RUN_KEY = `name: CI
jobs:
  framework:
    steps:
      - name: Lint
        run: bun lint
      run: bun test
`;

/** A command with a trailing comment on the same line. */
const FIXTURE_COMMENTED_RUN = `name: CI
jobs:
  framework:
    steps:
      - name: Lint
        run: bun lint # the lint gate
`;

/**
 * Split text on `&&` that is not nested inside parentheses, so a scoped gate
 * such as `(cd demo && bun lint)` stays one segment.
 */
function splitOnTopLevelAmpersands(text) {
  const segments = [];
  let depth = 0;
  let buffer = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (depth === 0 && char === "&" && text[index + 1] === "&") {
      segments.push(buffer);
      buffer = "";
      index += 2;
      continue;
    }

    buffer += char;
    index++;
  }

  segments.push(buffer);

  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

/**
 * Record a step's command, refusing the shapes this parser cannot read.
 *
 * A block scalar (`run: |`) hides its command behind several lines; reading
 * it as the literal `|` would compare a nonsense string against bin/check
 * and quietly pass. Refuse it instead.
 */
function assignRun(step, command, rawLine) {
  if (/^[|>][-+]?\d*$/.test(command)) {
    throw new Error(
      `ci_parity: multi-line "run:" steps are not supported — extend parseWorkflowGates to read:\n${rawLine}`,
    );
  }

  step.run = command;
}

/**
 * Apply one key of a step mapping. Only two keys carry a gate: `run` (the
 * command) and `working-directory` (where it runs). Every other key —
 * `name`, `id`, `uses`, `env` — is metadata the guard does not care about.
 */
function applyKey(step, content, rawLine) {
  const pair = content.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
  if (!pair) return;

  const raw = pair[2].trim();
  const quoted = raw.match(/^(['"])(.*)\1$/);
  const value = quoted ? quoted[2] : raw;

  if (pair[1] === "run") assignRun(step, value, rawLine);
  else if (pair[1] === "working-directory") step.workingDirectory = value;
}

/**
 * Strip the YAML comment from a line.
 *
 * A `#` opens a comment when it starts the line or follows whitespace,
 * and never inside a quoted scalar. A comment carries no gate, but
 * leaving it in place hid the key it trailed: `steps: # checks` did not
 * match the `steps:` header, so the whole step list of that job was
 * skipped while the other jobs' gates kept the comparison non-empty.
 */
function stripYamlComment(rawLine) {
  let quote = null;

  for (let index = 0; index < rawLine.length; index++) {
    const char = rawLine[index];

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#" && (index === 0 || /\s/.test(rawLine[index - 1]))) {
      return rawLine.slice(0, index);
    }
  }

  return rawLine;
}

/**
 * Count the `run:` keys a workflow declares inside its step lists — the
 * commands CI runs, before any filtering.
 *
 * The scan is deliberately independent of the parser: it finds a step
 * list by any key that starts with `steps` and ends it at the next
 * job-level key, so it still counts the commands of a list the parser
 * skipped. The parser must read exactly this many — fewer means a job's
 * gate list was skipped and the guard was comparing half a workflow,
 * more means it read a command the workflow never declares.
 */
function countRunKeysInStepLists(source) {
  let count = 0;
  let listIndent = null; // indentation of the `steps:` key of the open list

  for (const rawLine of source.split("\n")) {
    const stripped = stripYamlComment(rawLine);
    const line = stripped.trim();
    if (line === "") continue;

    const indent = stripped.length - stripped.trimStart().length;

    // A job-level key ends the open step list...
    if (listIndent !== null && indent <= listIndent) listIndent = null;

    // ...and the next `steps:` header opens the next one.
    if (/^steps\b/.test(line)) {
      listIndent = indent;
      continue;
    }

    if (listIndent === null) continue;

    const item = line.match(/^-\s+(.*)$/);
    const content = item ? item[1] : line;

    if (/^run\s*:/.test(content)) count++;
  }

  return count;
}

/**
 * Read the `run:` steps of a GitHub Actions workflow.
 *
 * Every list item of a `steps:` list is a step, whatever key it starts
 * with — `- name:`, `- uses:`, `- run:`, `- id:` … A parser that assumes
 * one shape drops the gates it cannot read, and the guard then fails OPEN.
 * A step's command is its `run` key and its directory its
 * `working-directory` key; a step without one runs at the repository root.
 */
function parseWorkflowGates(source) {
  const steps = [];
  let current = null; // the step being read
  let inSteps = false; // inside a `steps:` list
  let stepsIndent = 0; // indentation of the `steps:` key
  let itemIndent = null; // indentation of the step list items

  for (const rawLine of source.split("\n")) {
    const stripped = stripYamlComment(rawLine);
    const line = stripped.trim();
    if (line === "") continue;

    const indent = stripped.length - stripped.trimStart().length;

    // A `steps:` header opens a step list — with or without a trailing
    // comment. A header carrying anything else (a flow sequence, a
    // value) is a shape this parser cannot read: refusing it is loud,
    // skipping it drops that job's gates and lets the guard pass on the
    // other jobs' gates.
    const header = line.match(/^steps\s*:\s*(.*)$/);
    if (header && (current === null || indent <= stepsIndent)) {
      if (header[1].trim() !== "") {
        throw new Error(
          `ci_parity: unsupported "steps:" header — extend parseWorkflowGates to read:\n${rawLine}`,
        );
      }

      // A new step list — its items may sit at another indentation.
      inSteps = true;
      stepsIndent = indent;
      itemIndent = null;
      current = null;
      continue;
    }

    const item = stripped.match(/^(\s*)-\s+(.*)$/);
    if (
      item &&
      inSteps &&
      (itemIndent === null || item[1].length === itemIndent)
    ) {
      // A list item at the step indentation is a step, whatever key it
      // starts with. Deeper items are values nested inside the step.
      itemIndent = item[1].length;
      current = { run: null, workingDirectory: null };
      steps.push(current);
      applyKey(current, item[2], rawLine);
      continue;
    }

    if (!inSteps) continue;

    // A key at the job level ends the step list.
    if (indent <= stepsIndent) {
      inSteps = false;
      current = null;
      continue;
    }

    if (!current) {
      throw new Error(
        `ci_parity: a step key outside any step — extend parseWorkflowGates to read:\n${rawLine}`,
      );
    }

    applyKey(current, line, rawLine);
  }

  // Every command the workflow declares must have been read: a step list
  // the parser skipped would leave the guard comparing half a workflow.
  const read = steps.filter((step) => step.run !== null).length;
  const declared = countRunKeysInStepLists(source);

  if (read !== declared) {
    throw new Error(
      `ci_parity: read ${read} of ${declared} "run:" steps — extend parseWorkflowGates to read the rest`,
    );
  }

  return steps
    .filter((step) => step.run !== null && step.run !== SETUP_COMMAND)
    .map((step) => ({
      workingDirectory: step.workingDirectory || "",
      command: step.run,
    }));
}

/**
 * Read the gate chain of `bin/check` — its &&-joined command line — and split
 * it into (working directory, command) pairs.
 */
/**
 * Read the gate chain of `bin/check` — its &&-joined command line — and split
 * it into (working directory, command) pairs. Fixture sources have no `cd`,
 * so their unscoped segments keep "".
 */
const CHECK_CDS_APP = /^cd\s+\S+$/m;

function parseCheckGates(source) {
  const chain = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("&&") && !line.startsWith("#"));

  const baseDir = CHECK_CDS_APP.test(source) ? "apps/bun-on-rails" : "";
  const gates = [];

  for (const line of chain) {
    for (const segment of splitOnTopLevelAmpersands(line)) {
      // A `cd dir &&` scope in bin/check. Besides an explicit segment, the
      // gate's leading `cd apps/bun-on-rails` is the directory every
      // unscoped segment runs in.
      const scoped = segment.match(/^\(\s*cd\s+(\S+)\s*&&\s*(.+)\)$/);
      // A scoped segment's `cd dir` is relative to where the script already
      // is — bin/check `cd`s into apps/bun-on-rails first, so its demo gate
      // resolves to apps/bun-on-rails/demo.
      const dir = scoped
        ? baseDir
          ? `${baseDir}/${scoped[1]}`
          : scoped[1]
        : baseDir;
      const command = (scoped ? scoped[2] : segment).trim();

      gates.push({ workingDirectory: dir, command });
    }
  }

  return gates;
}

/**
 * The gates CI runs that bin/check does not run the same way. A gate
 * matches only when both the command AND the working directory are the
 * same — a root `bun lint` does not satisfy a `bun lint` that CI runs in
 * demo/.
 */
function findMissingGates(ciGates, checkGates) {
  return ciGates.filter(
    (gate) =>
      !checkGates.some(
        (candidate) =>
          candidate.command === gate.command &&
          candidate.workingDirectory === gate.workingDirectory,
      ),
  );
}

test("unit: every CI gate runs in bin/check with the same working directory", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const check = readFileSync(checkPath, "utf8");

  const ciGates = parseWorkflowGates(workflow);
  const checkGates = parseCheckGates(check);

  // An empty parse would make the assertion below vacuous — prove it found
  // the gates it claims to have found.
  expect(ciGates.length).toBeGreaterThan(0);
  expect(checkGates.length).toBeGreaterThan(0);

  expect(findMissingGates(ciGates, checkGates)).toEqual([]);
});

test("unit: bin/check runs the docs:build gate CI runs", () => {
  const check = readFileSync(checkPath, "utf8");

  const gates = parseCheckGates(check);

  expect(gates).toContainEqual({
    workingDirectory: "apps/bun-on-rails",
    command: "bun run docs:build",
  });
});

test("unit: a step keeps the working directory it runs in", () => {
  const ciGates = parseWorkflowGates(FIXTURE_WORKING_DIRECTORIES);

  expect(ciGates).toEqual([
    { workingDirectory: "demo", command: "bun lint" },
    { workingDirectory: "", command: "bun lint" },
  ]);

  // The working directory is part of the gate: a root `bun lint` in
  // bin/check must NOT satisfy the demo-scoped `bun lint`.
  const missing = findMissingGates(
    ciGates,
    parseCheckGates("bun lint && bun test"),
  );

  expect(missing).toEqual([{ workingDirectory: "demo", command: "bun lint" }]);
});

test("unit: a bare `- run:` step is a gate, not a dropped step", () => {
  const ciGates = parseWorkflowGates(FIXTURE_BARE_RUN_STEP);

  expect(ciGates).toEqual([
    { workingDirectory: "", command: "bun run build" },
    { workingDirectory: "", command: "bun run docs:build" },
    { workingDirectory: "demo", command: "bun lint" },
  ]);

  // A gate the parser cannot read must be reported as missing, never
  // dropped — dropping it would fail the guard OPEN.
  const missing = findMissingGates(
    ciGates,
    parseCheckGates("bun lint && bun test"),
  );

  expect(missing).toEqual([
    { workingDirectory: "", command: "bun run build" },
    { workingDirectory: "", command: "bun run docs:build" },
    { workingDirectory: "demo", command: "bun lint" },
  ]);
});

test("unit: a multi-line `run:` step is refused, not silently skipped", () => {
  expect(() => parseWorkflowGates(FIXTURE_MULTI_LINE_RUN)).toThrow(
    /multi-line "run:" steps are not supported/,
  );
});

test("unit: a first step headed by `- id:` is a gate, not a dropped step", () => {
  const ciGates = parseWorkflowGates(FIXTURE_ID_FIRST_STEP);

  expect(ciGates).toEqual([{ workingDirectory: "", command: "bun run audit" }]);

  // A gate the parser cannot read must be reported as missing, never
  // dropped — dropping it would fail the guard OPEN.
  const missing = findMissingGates(
    ciGates,
    parseCheckGates("bun lint && bun test"),
  );

  expect(missing).toEqual([{ workingDirectory: "", command: "bun run audit" }]);
});

test("unit: consecutive `- id:` steps are all gates", () => {
  const ciGates = parseWorkflowGates(FIXTURE_ID_STEPS);

  expect(ciGates).toEqual([
    { workingDirectory: "", command: "bun lint" },
    { workingDirectory: "", command: "bun test" },
  ]);

  // A gate missing from bin/check must be reported: the second step used
  // to overwrite the first one's command and vanish from the comparison.
  const missing = findMissingGates(
    ciGates,
    parseCheckGates("bun lint && bun run build"),
  );

  expect(missing).toEqual([{ workingDirectory: "", command: "bun test" }]);
});

test("unit: a `steps: # comment` header keeps that job's gates", () => {
  const ciGates = parseWorkflowGates(FIXTURE_MULTI_JOB_COMMENT_HEADER);

  // Both jobs' gates are read — the commented header used to drop the
  // first job's whole list.
  expect(ciGates).toEqual([
    { workingDirectory: "", command: "bun run audit" },
    { workingDirectory: "demo", command: "bun lint" },
  ]);

  // bin/check runs the demo gate but not the audit one. The missing gate
  // of the commented-header job must be reported even though the other
  // job's gate keeps the parse non-empty.
  const missing = findMissingGates(
    ciGates,
    parseCheckGates("bun lint && (cd demo && bun lint)"),
  );

  expect(missing).toEqual([{ workingDirectory: "", command: "bun run audit" }]);
});

test("unit: an unreadable `steps:` header is refused, not skipped", () => {
  expect(() => parseWorkflowGates(FIXTURE_UNSUPPORTED_STEPS_HEADER)).toThrow(
    /unsupported "steps:" header/,
  );
});

test("unit: a `run:` key the parser cannot place is refused, not skipped", () => {
  expect(() => parseWorkflowGates(FIXTURE_UNREADABLE_RUN_KEY)).toThrow(
    /read 1 of 2 "run:" steps/,
  );
});

test("unit: a trailing comment is not part of the command", () => {
  const ciGates = parseWorkflowGates(FIXTURE_COMMENTED_RUN);

  expect(ciGates).toEqual([{ workingDirectory: "", command: "bun lint" }]);
});
