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

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- Docs deployment: the `Deploy Documentation` workflow failed at the `Setup Pages` step with a Pages-site lookup 404 (run 41669345427) because `actions/configure-pages@v4` ran with its default `enablement: false`, which only looks the Pages site up and never enables or provisions it — the repository had no Pages site to look up. The step now runs with `enablement: true` so it enables/provisions the Pages site, and a `Preflight Pages site` step reports the required repository setting (**Settings > Pages > Build and deployment > Source = "GitHub Actions"**) as a non-fatal warning — without blocking the run, so `Setup Pages` can still provision the site — instead of failing with a bare 404; the `Build documentation`, `Upload artifact` and `Deploy to GitHub Pages` steps remain required. The failure was triggered by the docs merge 23ee9d66 / PR #22 (it matched the workflow's `docs/**` path filter) rather than caused by it — the documentation build step passed in that run.

### Security

- N/A

## [0.1.0] - 2025-01-24

### Added

- Initial release
- Core framework architecture
- Documentation site
