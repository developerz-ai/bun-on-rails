/**
 * CLI Help Output
 */

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
  generate, g            Generate code (model, controller, scaffold, etc.)
  db                     Database commands (migrate, rollback, seed, etc.)
  dev                    Start development server
  start                  Start production server
  console, c             Start interactive console
  routes                 List all routes
  test                   Run tests
  credentials            Manage encrypted credentials
  help                   Show this help

Options:
  -h, --help             Show help for command
  -v, --version          Show version
  --verbose              Show detailed output

Examples:
  brails new myapp
  brails generate scaffold Post title:string body:text
  brails db:migrate
  brails dev

Run \`brails help <command>\` for more information on a command.
`)
}

function printCommandHelp(command) {
  const help = commandHelp[command]
  if (!help) {
    console.log(`No help available for '${command}'`)
    return
  }
  console.log(help)
}

const commandHelp = {
  new: `
Usage: brails new <app-name> [options]

Create a new BunOnRails application.

Options:
  --database=TYPE        Database to use (postgres, mysql, sqlite)
  --skip-git             Skip git initialization
  --skip-docker          Skip Docker configuration
  --api                  API-only application (no frontend)

Examples:
  brails new myapp
  brails new myapp --database=mysql
  brails new myapp --api
`,

  generate: `
Usage: brails generate <type> <name> [fields...] [options]

Generate application code.

Types:
  scaffold              Model, controller, views, and routes
  model                 Model with migration
  controller            Controller class
  migration             Database migration
  job                   Background job
  mailer                Mailer class
  channel               WebSocket channel
  component             React component
  auth                  Full authentication system
  admin                 Admin panel for models

Options:
  --skip-migration      Don't generate migration
  --skip-test           Don't generate test file

Field Types:
  string                VARCHAR(255)
  text                  TEXT
  integer               INTEGER
  bigint                BIGINT
  float                 FLOAT
  decimal               DECIMAL
  boolean               BOOLEAN
  date                  DATE
  datetime              TIMESTAMP
  json                  JSON/JSONB
  references            Foreign key

Examples:
  brails g scaffold Post title:string body:text published:boolean
  brails g model User email:string name:string
  brails g controller Api::Posts
  brails g migration AddSlugToPosts
  brails g auth
`,

  db: `
Usage: brails db:<command> [options]

Database commands.

Commands:
  brails db:create       Create database
  brails db:drop         Drop database
  brails db:migrate      Run pending migrations
  brails db:rollback     Rollback last migration
  brails db:reset        Drop, create, and migrate
  brails db:seed         Load seed data
  brails db:setup        Create, migrate, and seed
  brails db:schema:load  Load schema without migrations
  brails db:schema:dump  Dump current schema

Options:
  --step=N              Rollback N migrations

Examples:
  brails db:migrate
  brails db:rollback --step=2
  brails db:reset
`
}
