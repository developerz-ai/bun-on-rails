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
 */

import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
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
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const indent = rawLine.length - rawLine.trimStart().length;

    if (/^steps:\s*$/.test(line)) {
      // A new step list — its items may sit at another indentation.
      inSteps = true;
      stepsIndent = indent;
      itemIndent = null;
      current = null;
      continue;
    }

    const item = rawLine.match(/^(\s*)-\s+(.*)$/);
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
function parseCheckGates(source) {
  const chain = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("&&") && !line.startsWith("#"));

  const gates = [];

  for (const line of chain) {
    for (const segment of splitOnTopLevelAmpersands(line)) {
      const scoped = segment.match(/^\(\s*cd\s+(\S+)\s*&&\s*(.+)\)$/);

      gates.push(
        scoped
          ? { workingDirectory: scoped[1], command: scoped[2].trim() }
          : { workingDirectory: "", command: segment },
      );
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
    workingDirectory: "",
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
