# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial framework implementation
- ORM with Active Record-style API
- Migration system with auto-schema sync
- Rails-like routing DSL
- Controller base class with context injection
- React frontend integration with hooks
- BullMQ-powered background jobs
- Native WebSocket support with channels
- Authentication generator
- File upload system with S3 support
- Redis-backed caching
- Mailer system with React templates
- Parallel test runner with transaction isolation
- CLI with generators
- Docker development environment
- Comprehensive documentation

### Changed

- The npm package is `bun-on-rails`. The old name, `@bun-on-rails`, was a scope with no package name: a clean `bun add -g` of the tarball failed with `invalid dependency name "@bun-on-rails"`. `files` now limits the tarball to `src/` plus the `package.json`, `README.md` and `LICENSE` that npm always adds: 47 files instead of 159 that included `test/`, `demo/`, `docs/` and the agent config. `homepage` points at the GitHub Pages docs site instead of the unresolvable bunonrails.com. `test/package_manifest.test.js` pins all three.

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- Docs deployment: the `Deploy Documentation` workflow made its `build` job depend on a GitHub Pages site that only a repository admin can create. Run 42344720510 (push of `bc4d6c8c`, the merge of PR #23) annotated that job with `Get Pages site failed. Error: Not Found` — the workflow token could read the Pages API, the site simply does not exist — and `Create Pages site failed. Error: Resource not accessible by integration`: creating a Pages site is a repository-administration operation that no workflow `permissions:` block can grant `GITHUB_TOKEN`. PR #23 could not have fixed it: it pinned `actions/configure-pages` to `v6.0.0` with `enablement: true`, which turns the action's read-only lookup into exactly that Create call, while its `Preflight Pages site` step was `continue-on-error: true` and only printed a warning — so the run stayed red. `docs.yml` now probes the Pages API read-only before `Build documentation`, records readiness as the `pagesReady` job output, always uploads `docs/.vitepress/dist` with `actions/upload-artifact`, and gates both `actions/upload-pages-artifact` and the `deploy` job on that output: a missing site leaves the build green with a `::warning` annotation naming the required setting and the deploy skipped. `actions/configure-pages` and `enablement:` are gone. The remaining step is human: **Settings > Pages > Build and deployment > Source = "GitHub Actions"**.

### Security

- N/A

## [0.1.0] - 2025-01-24

### Added

- Initial release
- Core framework architecture
- Documentation site
