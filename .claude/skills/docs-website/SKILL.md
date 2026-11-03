---
description: How the VitePress documentation site is written and built. Use for docs, documentation, guide page, vitepress, site.
applies: [typescript, javascript, bun]
---

> House skill — established by dz-runner setup mode from this repo's own evidence, then owned by its maintainers. Correct it in place; setup never overwrites a skill that exists.

1. Documentation pages live under `docs/eng/<section>/<page>.md`; the site config is `docs/.vitepress/config.js`.
2. Add a page to the sidebar in `docs/.vitepress/config.js` when you create a new file, otherwise it is unreachable from the nav.
3. Write pages in Markdown with VitePress frontmatter; use fenced code blocks with a language tag.
4. Run `bun run docs:dev` to preview locally at the VitePress dev URL. Stop it with Ctrl+C — do not leave the watcher running.
5. Build the site with `bun run docs:build`. Fail -> fix the broken markdown; the output lands in `docs/.vitepress/dist`.
6. Preview the built site with `bun run docs:preview`.
7. `docs/.vitepress/config.js` sets `ignoreDeadLinks: true` — dead links do not fail the build, so check links manually.
8. CI (`.github/workflows/docs.yml`) rebuilds and deploys to GitHub Pages on any push touching `docs/**`; the `ci.yml` build job also runs `bun run docs:build`.
