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

/** Whether `fn` throws in its own body (a nested function's throw does not count). */
function throwsDirectly(fn) {
  let found = false;
  const visit = (node) => {
    if (found || !node || typeof node.type !== "string") return;
    if (node.type === "ThrowStatement") {
      found = true;
      return;
    }
    if (node !== fn && FUNCTIONS.has(node.type)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range") continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(fn);
  return found;
}

/**
 * A TODO comment marks unfinished work, so the innermost function holding it
 * must throw (NotImplementedError) rather than return as if it were done: an
 * empty body, a placeholder return, or statements that compute and return
 * (assertJson read the body and returned) all count as silent.
 *
 * @param {string} root - a directory holding src/
 * @returns {string[]} `file:line name` for each function that holds a TODO and never throws
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
    const functions = [];
    const visit = (node, name) => {
      if (!node || typeof node.type !== "string") return;
      if (FUNCTIONS.has(node.type) && node.body?.type === "BlockStatement") {
        functions.push({ node, name: node.id?.name ?? name ?? "" });
      }
      const childName =
        node.type === "MethodDefinition" || node.type === "Property"
          ? (node.key?.name ?? node.key?.value)
          : undefined;
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key === "range") continue;
        if (Array.isArray(value)) value.forEach((v) => visit(v, childName));
        else if (value && typeof value === "object") visit(value, childName);
      }
    };
    visit(ast);
    const flagged = new Set();
    for (const todo of ast.comments.filter((c) => c.value.includes("TODO"))) {
      const holders = functions.filter(
        ({ node }) =>
          node.body.range[0] < todo.range[0] &&
          todo.range[1] < node.body.range[1],
      );
      const innermost = holders.sort(
        (a, b) =>
          a.node.body.range[1] -
          a.node.body.range[0] -
          (b.node.body.range[1] - b.node.body.range[0]),
      )[0];
      if (
        innermost &&
        !throwsDirectly(innermost.node) &&
        !flagged.has(innermost)
      ) {
        flagged.add(innermost);
        found.push(
          `${rel}:${innermost.node.loc.start.line} ${innermost.name}`.trim(),
        );
      }
    }
  }
  return found.sort();
}

describe("no silent stubs", () => {
  test("every function under src/ that holds a TODO throws", () => {
    // A planned API throws instead:
    //   throw new NotImplementedError('Job.performLater', 'queued jobs')
    expect(findSilentStubs(repoRoot)).toEqual([]);
  });

  describe("the scan itself", () => {
    const fixture = mkdtempSync(join(tmpdir(), "silent-stubs-"));
    afterAll(() => rmSync(fixture, { recursive: true, force: true }));

    test("finds a TODO in an empty body, a placeholder return, statements that return, or a nested function; passes a throw and a plain empty body", () => {
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
export class Response {
  async assertJson(expected) {
    const json = await this.json()
    // TODO: deep compare
    return this
  }
  register(model) {
    this.models.push(() => {
      // TODO: subscribe; the nested arrow is what does not throw
    })
    throw new Error('not yet')
  }
}
`,
      );

      expect(findSilentStubs(fixture)).toEqual([
        "src/lib/mixed.js:1 send",
        "src/lib/mixed.js:15 put",
        "src/lib/mixed.js:17 assertJson",
        "src/lib/mixed.js:23",
        "src/lib/mixed.js:4 useThing",
      ]);
    });
  });
});
