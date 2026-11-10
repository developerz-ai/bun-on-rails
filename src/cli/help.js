/**
 * CLI Help Output
 */

import { commands } from './commands/index.js'

const VERSION = '0.1.0'

export function printVersion() {
  console.log(`BunOnRails v${VERSION}`)
}

export function printHelp(command = null) {
  if (command) {
    printCommandHelp(command)
    return
  }

  console.log(`
BunOnRails - Full-stack JavaScript framework

Usage: brails <command> [options]

Commands:
  new <app-name>         Create a new BunOnRails application
  dev, server, s         Start development server
  start                  Start production server
  db:create              Create the database
  db:drop                Drop the database (--force in production)
  db:setup               Create the database, load db/schema.js, run db/seeds.js
  db:reset               Drop the database and set it up again
  db:migrate             Run pending migrations, then update db/schema.js
  db:rollback            Roll back the latest migration (--step=N for more)
  db:schema:dump         Write db/schema.js from the database
  db:schema:load         Load db/schema.js into an empty database
  db:seed                Run db/seeds.js
  routes [filter]        List the app's routes
  help                   Show this help

Planned (registered, not implemented yet; each exits with an error):
  generate, g            Generate code (model, controller, scaffold, etc.)
  console, c             Start interactive console
  test, t                Run tests (use \`bun test\` for now)
  credentials            Manage encrypted credentials

Options:
  -h, --help             Show help for command
  -v, --version          Show version
  --verbose              Show detailed output

Examples:
  brails new myapp
  brails dev
  brails db:migrate

Run \`brails help <command>\` for more information on a command.
`)
}

function printCommandHelp(command) {
  if (commands[command]?.implemented === false) {
    console.log(`brails ${command} is not implemented yet.`)
    return
  }
  const help = commandHelp[command]
  if (!help) {
    console.log(`No help available for '${command}'`)
    return
  }
  console.log(help)
}

const commandHelp = {
  db: `
Usage: brails db:<command>   (or: brails db <command>)

  db:create              Create the database
  db:drop [--force]      Drop the database (--force is required in production)
  db:setup               db:create, then db:schema:load, then db:seed (when db/seeds.js exists)
  db:reset [--force]     db:drop, then db:setup
  db:migrate             Run pending migrations in db/migrations, then update db/schema.js
  db:rollback [--step=N] Roll back the latest N migrations (default 1), then update db/schema.js
  db:schema:dump         Write db/schema.js from the database
  db:schema:load         Load db/schema.js into an empty database; marks its migrations as run
  db:seed                Run db/seeds.js

Each uses the database config/database.js names (DATABASE_URL in a generated app).
db:create and db:drop run on the server's postgres maintenance database.
`,

  routes: `
Usage: brails routes [filter]

List the routes config/routes.js defines, in the order requests match them:
verb, path, controller#action and name (the route's "as" option). A filter
keeps the rows whose path or controller#action contains it.
`,

  'db:create': `
Usage: brails db:create

Create the database config/database.js names, from the server's postgres
maintenance database. An existing database is reported, not an error.
`,

  'db:drop': `
Usage: brails db:drop [--force]

Drop the database config/database.js names. Refuses in production unless
--force is given.
`,

  'db:setup': `
Usage: brails db:setup

db:create, then db:schema:load, then db:seed when db/seeds.js exists.
`,

  'db:reset': `
Usage: brails db:reset [--force]

db:drop, then db:setup. Refuses in production unless --force is given.
`,

  'db:migrate': `
Usage: brails db:migrate

Run every pending migration in db/migrations, in file-name order, record each
version in schema_migrations, then rewrite db/schema.js. Uses the database
config/database.js names (DATABASE_URL in a generated app).
`,

  'db:schema:dump': `
Usage: brails db:schema:dump

Write db/schema.js from the database: every table, in an order that loads
(referenced tables first), versioned by the latest migration that ran.
`,

  'db:schema:load': `
Usage: brails db:schema:load

Load db/schema.js into an empty database, then mark the schema's version and
every migration file up to it as run, so db:migrate only runs newer ones.
`,

  'db:seed': `
Usage: brails db:seed

Run db/seeds.js with the app's database set for models. The file can do its
work at the top level or default-export a function (called with the connection).
`,

  'db:rollback': `
Usage: brails db:rollback [--step=N]

Run down() for the latest N migrations (default 1), remove them from
schema_migrations, then rewrite db/schema.js.
`,

  new: `
Usage: brails new <app-name> [--skip-install]

Create a new BunOnRails application in ./<app-name>: config/routes.js, a home
and a health controller, package.json, .gitignore and .env.example. Then runs
\`bun install\` there. The app runs with \`brails dev\` and needs no database.

<app-name> is lowercase letters, digits, "-" and "_", starting with a letter.

Options:
  --skip-install         Do not run bun install

Examples:
  brails new myapp
  brails new myapp --skip-install
`
}
