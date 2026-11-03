# AI-first scorecard

> Written by the developerz.ai maintainer agent — established by dz-runner setup mode. Each onboarding run rewrites this file whole; the latest run wins, and the same card is stored on the platform.

- Run: `run_7cb10907d1e44099b80aedd3feeb3aa4`
- Computed: 2026-11-03T15:49:22.215Z
- Proof: **proved** — every command ran green at head.
- Score: 13 of 15 items ok

## `policy` — ok

- .dz/maintainer/maintainer.yml established
- .dz/maintainer/reviewer.md established

## `brain` — ok

- CLAUDE.md already present, left alone

## `roster` — ok

- .claude/agents/database-orm.md established
- .claude/agents/routing-controller.md established
- .claude/agents/jobs-websocket.md established
- .claude/agents/cli-brails.md established

## `skills` — ok

- .claude/skills/verify-change/SKILL.md established
- .claude/skills/database-migrations/SKILL.md established
- .claude/skills/docs-website/SKILL.md established

## `scripts` — ok

- bin/setup established
- bin/dev established
- bin/check established
- bin/stop established
- down: ./bin/stop (bin)
- ./bin/setup exited 0 at head (0.1s)

## `wiring` — ok

- .mcp.json established

## `commands` — ok

- .claude/commands/planx.md established
- .claude/commands/feature.md established

## `access` — gap

- landed 0 of 12 asked
- still missing: DATABASE_URL, REDIS_URL, SESSION_SECRET, SECRET_KEY_BASE, APP_NAME, MAILER_ADAPTER, SMTP_HOST, SMTP_PORT, STORAGE_ADAPTER, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SENDGRID_API_KEY

## `layout` — gap

- migration to the house layout filed as tasks
- apps/bun-on-rails: 8 move(s) planned as one task

## `smoke_test` — ok

- test/framework.test.js in the repository
- run by ./bin/check exited 0 at head (2.7s)

## `env_example` — ok

- .env.example established

## `agents_md` — ok

- AGENTS.md established

## `per_workspace_brains` — ok

- single-package repository: 0 workspaces
- CLAUDE.md already present, left alone

## `docs_readme` — ok

- docs/README.md established

## `gate_proved` — ok

- ./bin/check exited 0 at head (2.7s)
