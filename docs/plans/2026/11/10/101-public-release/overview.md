# Plan 101 — public release of bun-on-rails

**Goal.** Ship `bun-on-rails` v0.1.0 to npm with public instructions that work, measured
against four bar items: (1) installs on a clean machine using only README and docs,
(2) every README and docs link resolves, (3) licence present, (4) CI green on main.

**Status: plan only.** Nothing in this directory changes code. Every measurement below
was taken on 2026-11-10 against `main` at `77c00e9`, with the command named next to it.
The bar is checked by [`bin/qa-release`](../../../../../../bin/qa-release) (section 4). Its baseline today:

```
FAIL  1. installs on a clean machine from README   README.md has no 'bun add -g <package>' install step
FAIL  2. every README/docs link resolves           lychee: 11 broken; config.js sets ignoreDeadLinks: true; config.js: 1 nav link(s) to missing pages
PASS  3. licence present                           MIT LICENSE in repo and tarball
FAIL  4. CI green on main                          docs.yml latest main run is failure (run 42344720510)
```

After D6 merged #32 (`880b79e`), `docs.yml` went green (run 42748243205) and **bar 4 passes**.
Bars 1 and 2 remain.

Tracker: [`status.yml`](status.yml). The tasks live in this file rather than one file per
slice, as the request asked for a single plan. Every task in section 3 is still one
file-set and one PR.

---

## 1. Findings

### Confirmed

| Claim                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"name": "@bun-on-rails"` is not a valid npm name          | `package.json:2`. Measured: `bun add -g <tarball>` in `oven/bun:1.4.4` fails with `error: invalid dependency name "@bun-on-rails"`; the registry answers `405` for it. `npm pack` does **not** catch it, so a passing dry run proves nothing.                                                                                                                                              |
| Nothing published, release.yml never ran                   | `git tag -l` empty, `gh release list` empty.                                                                                                                                                                                                                                                                                                                                               |
| `bun-on-rails` and `@developerz-ai/bun-on-rails` unclaimed | `curl https://registry.npmjs.org/<name>` returns `404` for both, and for `create-bun-on-rails` and `brails`. Whether an npm org named `developerz-ai` exists could not be checked: npmjs.com returns `403` to scripted requests.                                                                                                                                                           |
| README Quick Start has no install step                     | `README.md:19-26` starts at `brails new myapp`.                                                                                                                                                                                                                                                                                                                                            |
| Install instructions contradict each other                 | `docs/eng/getting-started/installation.md:61` `bun add -g @bun-on-rails`, `:67` `bor --version` (the bin is `brails`, `package.json:7-9`), `:76` `bun create bun-on-rails myapp` (no such package), `:89` `bun setup`. `docs/eng/getting-started/quick-start.md:8,10` repeat `bun create` / `bun setup`.                                                                                   |
| bunonrails.com does not resolve                            | `getent hosts bunonrails.com` gives no record; lychee times out. It is linked from `package.json:43`, `README.md:47` and `docs/eng/getting-started/introduction.md:85`.                                                                                                                                                                                                                    |
| No VitePress `base`                                        | `docs/.vitepress/config.js` has no `base:` key, so the site would load unstyled at `developerz-ai.github.io/bun-on-rails/`.                                                                                                                                                                                                                                                                |
| Two README guides "not yet available"                      | `README.md:51-52` (Routing & Controllers, Frontend Integration).                                                                                                                                                                                                                                                                                                                           |
| No `files` field, internals would ship                     | `npm pack --dry-run --json` (npm 10 via `bun x`): **159 files, only 44 under `src/`**. It also ships `test/` (33), `demo/` (25), `docs/` (18), `.claude/` (9), `.github/` (7), `.dz/` (4), `bin/`, `.codegraph/`, `.githooks/`, `.mcp.json`, `idea.txt`, `bun.lock`, `CLAUDE.md`, `AGENTS.md`. `src/` imports nothing outside `src/` (checked with `grep`), so a `src/` whitelist is safe. |
| NPM_TOKEN not set                                          | `gh api repos/developerz-ai/bun-on-rails/actions/secrets` returns `total_count: 0`; `.../actions/organization-secrets` returns `0`. I read these with push access, not admin, so a repo admin should confirm, but the API returned a count, not a 403.                                                                                                                                     |
| LICENSE (MIT) exists                                       | `LICENSE`, `package.json` `"license": "MIT"`, and `package/LICENSE` is in the packed tarball. Bar 3 passes.                                                                                                                                                                                                                                                                                |
| CI on main                                                 | `ci.yml` green on HEAD `77c00e9` (run 42345294560).                                                                                                                                                                                                                                                                                                                                        |
| Ultimate overlap                                           | Noted, not planned around. See D3.                                                                                                                                                                                                                                                                                                                                                         |

### Wrong or incomplete in the brief

- **"docs.yml deploys VitePress to GitHub Pages"**: it has never deployed. No Pages site
  exists (`gh api repos/.../pages` returns `404`, and `developerz-ai.github.io/bun-on-rails/`
  returns `404`). The last `Deploy Documentation` run on main failed at `configure-pages`
  with `Create Pages site failed ... Resource not accessible by integration` (run
  42344720510). A workflow token cannot create a Pages site; only a repo admin can.
- **"CI is green on main"**: only `ci.yml` is green. `docs.yml` also runs on push to main,
  and its latest run is red, so bar 4 fails today.

### New

1. **The Quick Start cannot work, whatever the package is named.** I installed a renamed
   tarball in a clean container and followed the README:
   - `brails new myapp` prints "Application created successfully!", **exits 0, and
     creates nothing** (`src/cli/commands/new.js:18-42`, every step a `TODO`).
   - `brails setup` returns `Unknown command: setup`, exit 1. No such verb exists
     (`src/cli/commands/index.js:15-49`).
   - `brails dev` boots without Postgres or Redis, but **every route returns 404**. The
     demo routes `/` and `/health` (`demo/config/routes.js:7,40`) point at controllers
     that do not exist; `demo/app/controllers/` holds only `posts` and `sessions`.

   This is the largest piece of work in the plan (D5, T3).

2. **The repo is already public** (`gh repo view`: `visibility: PUBLIC`). "Release" here
   means npm, a docs site and announcing it. `.mcp.json`, `.dz/`, `.claude/` and
   `idea.txt` are already readable on GitHub. They contain no secrets (`.mcp.json` uses
   `${VAR}` placeholders), so they are not a leak, but they should not be in the npm tarball.
3. **The README and docs describe features that are stubs.** Authentication with OAuth
   and `brails g auth` (`README.md:39,101`, the whole of
   `docs/eng/authentication/overview.md`), file uploads, a Redis cache, job scheduling
   (`performLater` at `README.md:122`) and mail delivery. CLAUDE.md "Scaffolds" lists each
   as a TODO stub, and no auth module exists in `src/`. The docs also claim SQLite and
   MySQL support (`installation.md:47,52`, `core-concepts/bun-runtime.md:26,35,307`), but
   `src/database/adapters/` holds only `postgres.js`.
4. **The VitePress build hides dead links.** `docs/.vitepress/config.js:8` sets
   `ignoreDeadLinks: true`, and the nav `API` entry (`:13`) points at
   `/eng/core-concepts/overview`, which does not exist. lychee does not read `config.js`,
   so the QA script checks both itself.
5. **Eleven broken links** (lychee 0.24.2): `docs/eng/database/overview.md:110,111,113`
   (associations, validations, n-plus-one-detection);
   `docs/eng/getting-started/project-structure.md:370,371` (routing, controllers);
   `docs/eng/getting-started/quick-start.md:312,313` (controllers, testing);
   `docs/README.md:7,8` (`idea/`, `standards/`, both marked "not created yet"); and
   bunonrails.com twice.
6. **Two open bot PRs change this plan's ground.**
   - #32 (`fix(docs): stop requiring a Pages site the workflow cannot create`, green,
     mergeable) turns `docs.yml` green and skips the deploy until an admin sets the Pages
     source. It unblocks bar 4.
   - #28 (`refactor: move app into apps/bun-on-rails`, 127 files, green, mergeable) moves
     `package.json` and `src/` into `apps/bun-on-rails/` and points `release.yml` there,
     but leaves `README.md` and `LICENSE` at the root. **Publishing from
     `apps/bun-on-rails/` would ship neither**, so bar 3 fails and the npm page has no
     readme. It also changes every path in this plan.
7. **release.yml has latent first-run bugs.**
   - The changelog step runs `git describe --tags --abbrev=0 HEAD^`
     (`.github/workflows/release.yml:50`). With no earlier tag this fails, the
     substitution is empty, and `git log ..HEAD` is an empty range, so the v0.1.0 notes
     list nothing.
   - The release body hardcodes `bun add @bun-on-rails` (`:62`).
   - Nothing checks that the tag matches `package.json` `version`.
   - The workflow uses Node 20 / npm 10 (`:35-39`), which is too old for npm trusted
     publishing.
8. **Every write is refused by default (found while writing T8).** CSRF protection is on
   (`src/application.js` `_setupMiddleware`, `security.csrf` defaulting to `true`). It
   compares the request's `X-CSRF-Token` with `session.csrfToken`, but nothing in `src/`
   ever sets `session.csrfToken`. So every `POST`/`PUT`/`PATCH`/`DELETE` answers `403`
   `{"error":"CSRF token mismatch"}` unless the app sets `security.csrf: false`.
   T11 fixed it: the session middleware issues `session.csrfToken`, and actions read it as `this.csrfToken`.
9. **The database is not connected at app boot, and initializer errors are swallowed (found
   while writing T5).**
   - `Application._initializeDatabase` only stores the database config, and `getConnection()`
     returns `null` until app code sets a connection, so a generated app's models cannot query
     yet. The getting-started pages say so; this is outside v0.1.0's bar.
   - In `_runInitializers`, the outer `try` catches an initializer's rethrown error and logs it
     at debug level as "No initializers directory found", so a failing initializer does not
     stop boot. Fixed by plan 102 task F1.
10. **ORM defects found while verifying the database pages (T6), each run against
    `postgres:16`.** The database pages now document them as current behaviour. None blocks the
    release bar, and none is filed as an issue, because `.dz/maintainer/maintainer.yml` would
    dispatch the bot to code them:
    - a `postgresql://` URL is rejected as adapter `postgre`;
    - query table names add `s` (`Category` becomes `categorys`) while `save()` uses `tableize`;
    - `where("x > ?", v)` placeholders produce invalid SQL;
    - `updateAll`, `deleteAll`, `updateWhere` and `deleteWhere` return 0 even when rows change;
    - `save()` always inserts `created_at` / `updated_at` and never refreshes `updated_at`;
    - `loadAssociation` fails for `hasMany`;
    - model queries ignore `connection.transaction`;
    - `MigrationRunner` fails on a relative path;
    - `loadSchema` creates tables alphabetically and fails on foreign keys;
    - `first()` / `last()` are ambiguous after a join.
11. **Native dependencies are fine.** `bcrypt` and `sharp` install and load in
    `oven/bun:1.4.4` from the tarball. Not a risk.
12. **On this box**, user `din` is not in the `docker` group, so the QA script ran under
    `sudo` with `GH_CONFIG_DIR` passed through.

---

## 2. Decisions for humans

**Decided 2026-11-10: every recommendation below was taken.** D6 is done: #32 merged as
`880b79e`; #28 moved to draft, with the reason posted on the PR.

| #   | Decision                                                                                         | Options                                                                                                                                                                                                                                                                                                                                                                           | Recommendation                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | npm name                                                                                         | (a) `bun-on-rails`, unscoped. (b) `@developerz-ai/bun-on-rails`. (c) both, one deprecated and pointing at the other.                                                                                                                                                                                                                                                              | **(a) `bun-on-rails`.** It matches the repo, gives the shortest install line (`bun add -g bun-on-rails`), and needs no npm org. (b) needs an npm org `developerz-ai`, whose existence I could not verify. Claim the name early: it is free today, and an unscoped name can be squatted.                                                                                  |
| D2  | Docs URL                                                                                         | (a) GitHub Pages project site `developerz-ai.github.io/bun-on-rails/`, `base: '/bun-on-rails/'`. (b) Register and point bunonrails.com (no DNS record today, so ownership is unknown). (c) No hosted site; link the `docs/` folder on GitHub.                                                                                                                                     | **(a) now.** It costs nothing, and #32 plus one admin setting (Settings > Pages > Source = GitHub Actions) finish it. A custom domain can come later: add a CNAME and drop `base` back to `/`. Whatever the choice, remove the bunonrails.com links before release.                                                                                                      |
| D3  | Overlap with Ultimate                                                                            | Release independently / hold / fold into Ultimate.                                                                                                                                                                                                                                                                                                                                | **Team call; this plan does not depend on it.** Settle it before announcing, since it decides what README positioning claims.                                                                                                                                                                                                                                            |
| D4  | Missing guides (Routing & Controllers, Frontend Integration) and the other 9 dead relative links | (a) Write them. (b) Drop the links. (c) Write some, drop the rest.                                                                                                                                                                                                                                                                                                                | **(c).** Write **Routing & Controllers** (T8): `src/routing/router.js` and `src/controller/` are real, working code, and it is the core of a Rails-like framework. **Drop** Frontend Integration (`src/react/` is a scaffold, so a guide would document stubs), the associations/validations/N+1/testing links, and the `idea/` / `standards/` rows in `docs/README.md`. |
| D5  | What the Quick Start promises (new, from finding 1)                                              | (a) Implement a minimal `brails new` that works with no database, and drop `brails setup` from the Quick Start. (b) Implement both `new` and `setup` (Docker plus DB create/migrate; the `db:*` commands are stubs, so `setup` has nothing real to call). (c) No generator: document "install as a library, write `config/routes.js` and a controller by hand, run `brails dev`". | **(a).** The Quick Start becomes `bun add -g bun-on-rails` / `brails new myapp` / `cd myapp` / `brails dev`, and every step is real. (b) would ship a `setup` that cannot migrate. (c) is honest but drops the main selling point.                                                                                                                                       |
| D6  | Open PRs #28 and #32                                                                             | Merge / close / defer each.                                                                                                                                                                                                                                                                                                                                                       | **Merge #32** (it unblocks bar 4 and touches no code). **Close or defer #28 until after v0.1.0**: as written, it ships a tarball with no README or LICENSE (finding 6) and reroutes every path here. If it lands first, this plan's paths need a `apps/bun-on-rails/` prefix, and the release has to copy README and LICENSE into the package directory.                 |
| D7  | Publish credential                                                                               | (a) Long-lived `NPM_TOKEN` repo secret. (b) npm trusted publishing (OIDC). `id-token: write` is already set at `release.yml:10`. It needs Node >= 22.14 / npm >= 11.5, and it can only be configured on a package that already exists.                                                                                                                                            | **(b), with a one-time manual first publish of v0.1.0 by a human with npm rights.** Then configure trusted publishing for `developerz-ai/bun-on-rails` / `release.yml`, so no token lives in the repo. Fallback: (a), added by a repo admin.                                                                                                                             |

Human-only actions, outside any agent's reach:

- **Repo admin**: Settings > Pages > Source = GitHub Actions (after D2 = a and #32).
- **npm account owner**: claim the name and do the first publish (D1, D7).
- I have push access, not admin.

---

## 3. Tasks

Each task is one PR, and the file sets do not overlap except the noted CLAUDE.md rows.
CLAUDE.md rule 5 ("when this file and the code disagree, this file is the bug") means
any task that changes behaviour updates its CLAUDE.md row in the same PR. Every PR goes
through `bin/check`.

Suggested order (one PR in flight at a time): **T10, T1, T2, T3, T8, T5 ∥ T6, T4, T7, T11, T9**, then tag.

### T1 — Package manifest: valid name, `files` whitelist, homepage

- **Depends on:** D1, D2.
- **Files:** `package.json:2,43`, a new `files` key. `CLAUDE.md:23` (Stack "Package" row).
- **Steps:**
  1. Set `name` to the D1 choice.
  2. Add `"files": ["src/"]`. npm adds `package.json`, `README.md` and `LICENSE` on its own, but not `CHANGELOG.md` (measured).
  3. Set `homepage` to the D2 URL.
  4. Update the CLAUDE.md row.
- **Acceptance** (set `N` to the D1 name):
  ```bash
  N=bun-on-rails; docker run --rm -v "$PWD":/r:ro -w /r node:22-slim npm pack --dry-run --json \
    | jq -e --arg n "$N" '.[0].name == $n and all(.[0].files[].path; test("^(src/|package\\.json$|README\\.md$|LICENSE$|CHANGELOG\\.md$)"))'
  ```

### T2 — Stub commands fail loudly instead of printing success

- **Depends on:** nothing.
- **Files:** `src/cli/commands/{generate,db,console,routes,test,credentials}.js`, `test/cli/`, the CLAUDE.md "Registered but not implemented" table (`CLAUDE.md:87-100`).
- **Steps:**
  1. Each stub `run()` throws `Error('brails <cmd> is not implemented yet — track it at <issue URL>')`. `src/cli/index.js:30-37` already turns a throw into exit 1.
  2. Add one test per command asserting the non-zero exit.
- **Acceptance:**
  ```bash
  for c in "generate model X" db:migrate db:rollback console routes test credentials; do
    bun src/cli/index.js $c >/dev/null 2>&1 && echo "still exits 0: $c"; done | grep . && exit 1; bin/check
  ```

### T3 — `brails new <name>` generates an app that boots with no database

- **Depends on:** D5 (= a).
- **Files:** `src/cli/commands/new.js`, new `src/cli/templates/app/**` (must sit under `src/` so T1's whitelist ships it), new `test/cli/new.test.js`, `CLAUDE.md:91` plus the Scaffolds row.
- **Steps:**
  1. Validate the name (`^[a-z][a-z0-9_-]*$`) and refuse an existing directory.
  2. Copy the template tree:
     - `package.json`: `"type": "module"`, `private`, scripts `dev`/`start`, and a dependency on the CLI's own `name`@`^version`, read from its `package.json` at runtime so it follows T1.
     - `config/routes.js`: `root('home#index')`, `get('/health', 'health#index')`.
     - `app/controllers/home_controller.js` and `health_controller.js`, extending the exported `Controller`.
     - `config/environments/development.js`: port 3000.
     - `.gitignore`, `.env.example` (names only, per the secrets rule), `README.md`.
  3. Run `bun install` in the new directory and propagate its exit code. Add `--skip-install` for tests and offline use (Rails' `--skip-bundle`).
  4. Print only steps that actually ran.
- **Tests:** generate into a temp dir with `--skip-install`, symlink the repo as `node_modules/<name>`, boot `Application` on port 0, and assert `GET /` and `GET /health` both return 200. Also assert an existing directory is refused.
- **Acceptance:** `bun test test/cli/new.test.js && bin/check`. Integration: after T1 and T4, `bin/qa-release` bar 1 passes.

### T4 — README: real Quick Start, honest feature list

- **Depends on:** D1, D2, D4, D5, T3.
- **Files:** `README.md` only.
- **Steps:**
  1. Quick Start becomes `bun add -g <name>` / `brails new myapp` / `cd myapp` / `brails dev`, plus "open `http://localhost:3000`".
  2. Fix the zero-config line (`:14`).
  3. Split the Features table into **Available** and **Planned**, using CLAUDE.md Scaffolds as the source of truth (auth, uploads, Redis cache, job scheduling, mail delivery, channels and React hooks are Planned).
  4. The CLI section lists only `new`, `dev`, `start` and `--help`; the rest go under Planned.
  5. Change the "For AI Agents" example to `performNow`.
  6. Docs link goes to the D2 URL; the guide list follows D4.
- **Acceptance:** `bun test test/docs/readme.test.js`. It checks three things:
  - the Quick Start's first line is `bun add -g <package.json name>`;
  - every `brails …` line in a README bash block is an implemented command (planned ones may only be named in prose);
  - the README's example files, written over a fresh `brails new` app, answer as described.

  Integration: `bin/qa-release` bar 1. The docs link goes to `docs/` in the repo until the Pages site is live; T7 adds the site URL, so the README never carries a link that is known to be broken.

### T5 — Getting-started docs follow the working path

- **Depends on:** D1, D2, D5, T3, and T8 if D4 writes the guide.
- **Files:** `docs/eng/getting-started/{installation,quick-start,introduction,project-structure}.md`.
- **Steps:**
  1. Rewrite installation and quick-start to the T4 sequence.
  2. Delete `bor`, `bun create`, `bun setup`, `bun db:*`, `bun generate`, `docker:status` and the SQLite/MySQL lines.
  3. Point `introduction.md:85` at the D2 URL.
  4. Fix the dead links at `project-structure.md:370-371` and `quick-start.md:312-313`: point them at T8's page, or drop them per D4.
- **Acceptance:**
  ```bash
  ! grep -rnE 'bun create|bor --version|bun setup|bun (db:|generate|dev)|docker:status|@bun-on-rails|MySQL|MariaDB|SQLite|bunonrails\.com' docs/eng/getting-started
  ```

### T6 — Rest of the docs: no nonexistent commands, no dead links

- **Depends on:** D4, D5, and T8 if D4 writes the guide.
- **Files:** `docs/eng/core-concepts/{bun-runtime,philosophy}.md`, `docs/eng/guides/vibe-coding.md`, `docs/eng/authentication/overview.md`, `docs/eng/database/overview.md`, `docs/README.md`.
- **Steps:**
  1. Replace `bun dev` / `bun generate` / `brails setup` / `brails g auth`. Imports of `@bun-on-rails` become `bun-on-rails`, the name T1 set. Subpath imports (`/react`, `/search`, `/test`) do not exist, so drop them.
  2. Remove the SQLite claims.
  3. Mark `authentication/overview.md` as Planned at the top, or remove it and its README link (D4).
  4. Drop `database/overview.md:110-113` links to missing pages, and the `docs/README.md:7-8` rows.
- **Acceptance:**
  ```bash
  ! grep -rnE 'bun (dev|generate|setup|create)|brails (setup|g auth)|SQLite|@bun-on-rails' docs/eng --exclude-dir=getting-started \
    && docker run --rm -v "$PWD":/i:ro -w /i lycheeverse/lychee:0.24.2 --offline --no-progress --root-dir /i docs/
  ```

### T7 — Docs site: base path, dead-link checking on, Pages deploy

- **Depends on:** D2, T5, T6, T8; #32 merged; Pages source set by an admin.
- **Files:** `docs/.vitepress/config.js`.
- **Steps:**
  1. Add `base: '/bun-on-rails/'`, and `srcExclude: ['plans/**', 'README.md']`, so plans and the folder index stay out of the public site. Plans link into `bin/`, which a dead-link-checked build would reject.
  2. Set `ignoreDeadLinks: false`, so the build becomes the guard.
  3. Point the nav `API` link (`:13`) at an existing page, or remove it.
  4. List every published page in the sidebar.
- **Acceptance:**
  ```bash
  bun run docs:build && ! grep -q 'ignoreDeadLinks: *true' docs/.vitepress/config.js \
    && curl -fsS https://developerz-ai.github.io/bun-on-rails/ | grep -q '/bun-on-rails/assets/'
  ```
  The `curl` part passes only after the merge deploys.

### T7b — Link the live docs site (after an admin enables Pages)

- **Depends on:** T7 merged, and Settings > Pages > Source = GitHub Actions set by a repo admin (a human-only step; the workflow token cannot create a Pages site).
- **Files:** `README.md` (the Documentation section).
- **Steps:**
  1. Re-run the `Deploy Documentation` workflow and confirm the deploy job ran.
  2. Add `https://developerz-ai.github.io/bun-on-rails/` to the README's Documentation section.
- **Acceptance:** `curl -fsS https://developerz-ai.github.io/bun-on-rails/ | grep -q '/bun-on-rails/assets/' && bin/qa-release`. The link is added only once it resolves, so bar 2 never carries a known-broken link.

### T8 — Routing & Controllers guide (only if D4 says write)

- **Depends on:** D4.
- **Files:** new `docs/eng/routing/overview.md`, new `test/docs/routing_guide.test.js`. The test writes every code block titled with a path (` ```js [config/routes.js] `) over a fresh `brails new` app, boots it, and checks the responses the guide lists.
- **Steps:**
  1. Document `root`, `get`/`post`/…, `resources` (with `only`/`except` and nesting) and `namespace`, from `src/routing/router.js`.
  2. Document the controller class, context (`this.params`, `this.request`, `this.session`, `this.render`) and `beforeAction` filters, from `src/controller/base.js` and `src/controller/middleware.js:299`.
  3. Every example must run against the T3 template app.
- **Acceptance:**
  ```bash
  test -s docs/eng/routing/overview.md \
    && docker run --rm -v "$PWD":/i:ro -w /i lycheeverse/lychee:0.24.2 --offline --no-progress --root-dir /i docs/eng/routing/
  ```

### T11 — Issue CSRF tokens, so writes work with CSRF on

- **Depends on:** T8 (its guide and test describe the current behaviour and must change with it).
- **Files:**
  - `src/controller/middleware.js`: the session and csrf middleware.
  - `src/controller/base.js`: expose the token to actions.
  - `test/controller/`.
  - `docs/eng/routing/overview.md` and `test/docs/routing_guide.test.js`: the CSRF section and its test.
- **Steps:**
  1. The session middleware gives a session a random `csrfToken` when it has none.
  2. Controllers read it as `this.csrfToken`, so an action can hand it to the page or client.
  3. The csrf middleware stays on by default and is unchanged otherwise.
  4. Update the guide: describe the token flow, and keep `security.csrf: false` documented for header-authenticated APIs.
- **Acceptance:** a test that GETs an action returning `this.csrfToken`, then POSTs with the session cookie and `X-CSRF-Token`, gets past the check (and a POST without it still gets `403`): `bun test test/controller/ test/docs/routing_guide.test.js && bin/check`.

### T9 — release.yml: correct first release, gated on the QA script

- **Depends on:** D1, D7, T10.
- **Files:** `.github/workflows/release.yml`, new `test/release_workflow.test.js` (same guard pattern as #32's `test/docs_workflow.test.js`).
- **Steps:**
  1. Fail if `${GITHUB_REF_NAME#v}` differs from `package.json` `version`.
  2. Run `bin/qa-release "$GITHUB_WORKSPACE"` before publishing.
  3. Use Node 22 and the latest npm. Publish with `--provenance`, via OIDC (D7 b) or `NPM_TOKEN` (D7 a).
  4. Fall back to the root commit when no earlier tag exists.
  5. Build the release-body install line from `package.json` `name`.
- **Acceptance:**
  ```bash
  bun test test/release_workflow.test.js && docker run --rm -v "$PWD":/r -w /r rhysd/actionlint:latest
  ```

### T10 — Land the QA script in the repo

- **Depends on:** nothing.
- **Files:** new `bin/qa-release` (the QA script from section 4), a `bin/` row in CLAUDE.md (`:72-77`). It exits 75 when docker or the source is unreachable, following the exit-code contract in `.claude/skills/verify-change/SKILL.md`.
- **Acceptance:**
  ```bash
  docker run --rm -v "$PWD":/m:ro koalaman/shellcheck:stable /m/bin/qa-release \
    && bin/qa-release . | tail -4 | grep -cE '^(PASS|FAIL) ' | grep -qx 4
  ```

**Done when** `bin/qa-release` exits 0 on `main`, followed by tag `v0.1.0`. Under D7 (b), a human does the first publish.

---

## 4. QA script

[`bin/qa-release`](../../../../../../bin/qa-release) checks all four bar items from a fresh clone. It uses
only docker (with compose), git and gh on the host.

```bash
bin/qa-release        # fresh clone of main
bin/qa-release .      # committed state of this checkout
```

| Bar         | How it is checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 install   | 1. `npm pack` in `node:22-slim`. 2. Publish the tarball to a throwaway **Verdaccio** registry (compose service). The README's real package name, and any `bun install` that `brails new` runs, then resolve to the tarball under test, and nothing reaches npmjs.org. 3. Take the README's `bun add -g …` line (it must name `package.json`'s `name`) and its Quick Start block, and run them **verbatim** in a clean `oven/bun:1.4.4` container. 4. `brails dev` runs in the background. 5. Pass if `GET http://localhost:3000/` returns 2xx/3xx within 90s. |
| 1, services | **docker compose, not SQLite.** The framework has no SQLite adapter (`src/database/adapters/` holds only `postgres.js`). `postgres:16` and `redis:7` run as compose services and reach the app as `DATABASE_URL` / `REDIS_URL`, matching `ci.yml`. Today `brails dev` does not need them (measured), but they are there for when the app does.                                                                                                                                                                                                                |
| 2 links     | 1. `lycheeverse/lychee:0.24.2` over `README.md` and `docs/`, including fragments. 2. Fail on `ignoreDeadLinks: true` in `config.js`. 3. Fail on any `config.js` nav link with no page behind it.                                                                                                                                                                                                                                                                                                                                                              |
| 3 licence   | `LICENSE` is non-empty MIT text, `package.json` `license` is `MIT`, and `package/LICENSE` is in the tarball.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4 CI        | For every workflow that runs on push to main (`ci.yml`, `docs.yml`), the latest completed main run is `success`, and `ci.yml` has completed on main HEAD.                                                                                                                                                                                                                                                                                                                                                                                                     |

It prints `PASS`/`FAIL` with a reason per item and exits 0 only on four PASSes.

How I verified the script itself, 2026-11-10:

- Run against live main: the baseline at the top of this file.
- Run against a scratch clone with the package renamed and a `bun add -g` line added. Publish, install and `brails new` ran, then it failed at `+ cd myapp`, the measured stub.
- Run against a second scratch commit with `mkdir myapp` in place of `brails new`. The server booted and the poller reported `GET / -> 404`.

Every stage has run in real containers. A bar 1 **PASS** has not, because it needs T3.
