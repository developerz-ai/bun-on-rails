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
8. CI: `.github/workflows/docs.yml` rebuilds and deploys to GitHub Pages on any push touching `docs/**` (or the workflow file itself); the `ci.yml` build job also runs `bun run docs:build`. Deployment needs a GitHub Pages site that **only a repository admin can create** — Settings > Pages > Build and deployment > Source = "GitHub Actions". The workflow never creates it and cannot: creating a Pages site is a repository-administration operation that no `permissions:` block can grant `GITHUB_TOKEN`. The shape that ships, so you know what not to break:
   - A read-only probe, `id: pages-site`, runs _before_ `Build documentation`: it `curl`s `${GH_API_URL}/repos/${GH_REPO}/pages` with the repo `GITHUB_TOKEN`, the `X-GitHub-Api-Version: 2022-11-28` header and `--write-out '\n%{http_code}'`, then writes `ready=true|false` to `$GITHUB_OUTPUT`. It never exits non-zero (there is no `continue-on-error` anywhere in this file): a missing site is a `::warning` annotation naming the setting above, not a red build. The `build` job declares its own narrow `permissions: contents: read` + `pages: read` — a read scope cannot create a site, which is what makes the create call unreachable — and no workflow-level `permissions:` block exists.
   - The `build` job exposes it as output `pagesReady`, and always publishes `docs/.vitepress/dist` with `actions/upload-artifact`, so the built site stays downloadable even while deploys are off.
   - `actions/upload-pages-artifact` is gated on `steps.pages-site.outputs.ready == 'true'`, and the `deploy` job (still `actions/deploy-pages`) on `needs.build.outputs.pagesReady == 'true'`. Only the `deploy` job holds `pages: write` and `id-token: write`. A missing site therefore ends as _build green, deploy skipped_, with the required setting named in the run summary.
   - There is deliberately no `actions/configure-pages` step and no `enablement:` input. `enablement: true` made that action call the Create Pages site API, which answers `Create Pages site failed. Error: Resource not accessible by integration` for the workflow token — the shape PR #23 shipped, recorded in run 42344720510. Re-adding it, or ungating the Pages artifact upload or the `deploy` job, is the regression `test/docs_workflow.test.js` exists to catch: run `bun test test/docs_workflow.test.js` after touching either file.
