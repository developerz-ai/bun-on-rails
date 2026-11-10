/**
 * Docs site config guard
 *
 * The VitePress config set no `base` (a GitHub Pages project site loads
 * without its styles), `ignoreDeadLinks: true` (the build passed with dead
 * links in it), a nav "API" entry pointing at a page that never existed, and
 * a sidebar listing four of the pages. Plans under docs/plans/ would have been
 * published as site pages. These rules pin the fixed config and keep the
 * sidebar and the pages in step.
 */

import { test, expect, describe } from "bun:test";
import { existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import config from "../../docs/.vitepress/config.js";
import { repoRoot } from "./support/guide_app.js";

const docs = join(repoRoot, "docs");

function pagesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? pagesUnder(path)
      : name.endsWith(".md")
        ? [path]
        : [];
  });
}

const sidebarLinks = config.themeConfig.sidebar.flatMap((group) =>
  group.items.map((item) => item.link),
);
const navLinks = config.themeConfig.nav.map((item) => item.link);

describe("docs/.vitepress/config.js", () => {
  test("is served from the GitHub Pages project path", () => {
    expect(config.base).toBe("/bun-on-rails/");
  });

  test("fails the build on a dead link", () => {
    expect(config.ignoreDeadLinks).toBe(false);
  });

  test("keeps plans and the folder index off the public site", () => {
    expect(config.srcExclude).toEqual(
      expect.arrayContaining(["plans/**", "README.md"]),
    );
  });

  test("every nav and sidebar link is a page that exists", () => {
    for (const link of [...navLinks, ...sidebarLinks].filter((l) =>
      l.startsWith("/"),
    )) {
      expect({ link, exists: existsSync(join(docs, `${link}.md`)) }).toEqual({
        link,
        exists: true,
      });
    }
  });

  test("every page under docs/eng/ is in the sidebar", () => {
    const pages = pagesUnder(join(docs, "eng")).map(
      (p) => "/" + relative(docs, p).replace(/\.md$/, ""),
    );
    for (const page of pages) {
      expect({ page, inSidebar: sidebarLinks.includes(page) }).toEqual({
        page,
        inSidebar: true,
      });
    }
  });
});
