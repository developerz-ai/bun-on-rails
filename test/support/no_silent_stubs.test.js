/**
 * No silent stubs under src/
 *
 * A function whose body is only TODO comments, or TODO comments and a
 * placeholder `return`, reports success while doing nothing. On 2026-11-10
 * there were 96 of them behind the package entry (plan 105): Job.performLater,
 * Mail#deliver, Storage#upload, withinTransaction, useResource, ... Each now
 * throws NotImplementedError (src/support/not_implemented.js). This guard
 * fails on the next one, listing file:line and the function.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { parse } from "espree";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = join(import.meta.dir, "..", "..");
const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/**
 * @param {string} root - a directory holding src/
 * @returns {string[]} `file:line name` for each silent stub
 */
function findSilentStubs(root) {
  const found = [];
  for (const rel of [...new Bun.Glob("src/**/*.js").scanSync(root)].sort()) {
    const code = readFileSync(join(root, rel), "utf8");
    const ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      comment: true,
      loc: true,
      range: true,
    });
    const todos = ast.comments.filter((c) => c.value.includes("TODO"));
    const visit = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (FUNCTIONS.has(node.type) && node.body?.type === "BlockStatement") {
        const [start, end] = node.body.range;
        const statements = node.body.body.filter(
          (s) => s.type !== "EmptyStatement",
        );
        const hasTodo = todos.some(
          (c) => c.range[0] > start && c.range[1] < end,
        );
        const silent =
          statements.length === 0 ||
          statements.every((s) => s.type === "ReturnStatement");
        if (hasTodo && silent)
          found.push(
            `${rel}:${node.loc.start.line} ${node.id?.name ?? ""}`.trim(),
          );
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key === "range") continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    visit(ast);
  }
  return found;
}

describe("no silent stubs", () => {
  test("no function under src/ is only TODO comments, or TODO comments and a return", () => {
    // A planned API throws instead:
    //   throw new NotImplementedError('Job.performLater', 'queued jobs')
    expect(findSilentStubs(repoRoot)).toEqual([]);
  });

  describe("the scan itself", () => {
    const fixture = mkdtempSync(join(tmpdir(), "silent-stubs-"));
    afterAll(() => rmSync(fixture, { recursive: true, force: true }));

    test("finds an empty TODO body and a TODO placeholder return; passes a throw and a plain empty body", () => {
      mkdirSync(join(fixture, "src", "lib"), { recursive: true });
      writeFileSync(
        join(fixture, "src", "lib", "mixed.js"),
        `export async function send() {
  // TODO: send it
}
export function useThing() {
  // TODO: fetch
  return { data: null }
}
export class Queue {
  add() {
    // TODO: enqueue
    throw new Error('not yet')
  }
  close() {}
}
export const adapters = { local: { put: async () => { /* TODO: write */ } } }
`,
      );

      expect(findSilentStubs(fixture)).toEqual([
        "src/lib/mixed.js:1 send",
        "src/lib/mixed.js:4 useThing",
        "src/lib/mixed.js:15",
      ]);
    });
  });
});
