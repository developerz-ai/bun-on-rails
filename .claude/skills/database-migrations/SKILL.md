---
description: How migrations are written, run and rolled back here. Use for migration, schema, rollback, migrate, table change.
applies: [typescript, javascript, bun]
---

> House skill — established by dz-runner setup mode from this repo's own evidence, then owned by its maintainers. Correct it in place; setup never overwrites a skill that exists.

1. Write the migration class in `db/migrations/` with a timestamped filename, e.g. `20250124000001_create_users.js`. The timestamp prefix is what orders migrations.
2. Extend `Migration` from `apps/bun-on-rails/src/database/migration.js` and implement both `up()` and `down()`.
3. Build the table inside `up()` with the TableBuilder callback: `await db.createTable('users', (t) => { t.id(); t.string('email').notNull(); t.timestamps() })`.
4. Use `t.references('user')` for foreign keys — it creates `user_id` — and `t.timestamps()` for `created_at` / `updated_at`.
5. Implement `down()` with `await db.dropTable('users')`. A missing `down()` breaks rollback.
6. Run `bun run src/cli/index.js db:migrate` from `apps/bun-on-rails` (the demo app root). Fail -> check the migration file is under `db/migrations/` and that the filename timestamp is unique.
7. Roll back the last migration with `bun run src/cli/index.js db:rollback`.
8. Never hand-edit the dumped schema — `apps/bun-on-rails/src/database/schema.js` regenerates it.
9. Prove the change with `bun test` from `apps/bun-on-rails`; migration behaviour is covered by `apps/bun-on-rails/test/database/migration.test.js` and `apps/bun-on-rails/test/database/migration_runner.test.js`.
