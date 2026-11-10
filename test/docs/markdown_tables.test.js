/**
 * Every markdown table row has as many cells as its header.
 *
 * A scripted edit once turned a README row into `| \1 | Testing | ... |`
 * (four cells in a two-column table) and replaced a plan's task row the same
 * way; Prettier formats such a row without complaint and the docs site
 * renders it, so nothing noticed. This guard does.
 */

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

/** Cells in a table row: split on pipes that are not escaped and not inside backticks. */
function cellCount(row) {
  let cells = 0;
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === "`") inCode = !inCode;
    else if (c === "\\") i++;
    else if (c === "|" && !inCode) cells++;
  }
  return cells - 1;
}

/** `file:line` for each row whose cell count differs from its table's header. */
function misshapenRows(rel) {
  const lines = readFileSync(join(repoRoot, rel), "utf8").split("\n");
  const found = [];
  let header = null;
  let inFence = false;
  lines.forEach((line, i) => {
    if (line.startsWith("```")) inFence = !inFence;
    const isRow = !inFence && /^\|.*\|\s*$/.test(line);
    if (!isRow) {
      header = null;
      return;
    }
    if (header === null) {
      header = cellCount(line);
    } else if (cellCount(line) !== header) {
      found.push(
        `${rel}:${i + 1} has ${cellCount(line)} cells, the header ${header}`,
      );
    }
  });
  return found;
}

test("every markdown table row has as many cells as its header", () => {
  const files = [
    "README.md",
    "CLAUDE.md",
    "CHANGELOG.md",
    ...new Bun.Glob("docs/**/*.md").scanSync(repoRoot),
  ].filter((f) => !f.includes("node_modules"));
  expect(files.flatMap(misshapenRows)).toEqual([]);
});
