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
  help                   Show this help

Planned (registered, not implemented yet; each exits with an error):
  generate, g            Generate code (model, controller, scaffold, etc.)
  db:<command>           Database commands (migrate, rollback, seed, etc.)
  console, c             Start interactive console
  routes                 List all routes
  test, t                Run tests (use \`bun test\` for now)
  credentials            Manage encrypted credentials

Options:
  -h, --help             Show help for command
  -v, --version          Show version
  --verbose              Show detailed output

Examples:
  brails new myapp
  brails dev

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
`
}
