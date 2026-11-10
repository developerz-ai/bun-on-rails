/**
 * CLI Commands Registry
 */

import { newCommand } from './new.js'
import { generateCommand } from './generate.js'
import {
  dbCreateCommand,
  dbDropCommand,
  dbResetCommand,
  dbSetupCommand,
  dbMigrateCommand,
  dbRollbackCommand,
  dbSchemaDumpCommand,
  dbSchemaLoadCommand,
  dbSeedCommand
} from './db.js'
import { devCommand } from './dev.js'
import { startCommand } from './start.js'
import { consoleCommand } from './console.js'
import { routesCommand } from './routes.js'
import { testCommand } from './test.js'
import { credentialsCommand } from './credentials.js'

export const commands = {
  'new': newCommand,
  'create': newCommand, // alias

  'generate': generateCommand,
  'g': generateCommand, // alias

  // `brails db migrate` is `brails db:migrate`; see dbCommand below
  'db:migrate': dbMigrateCommand,
  'db:rollback': dbRollbackCommand,
  'db:create': dbCreateCommand,
  'db:drop': dbDropCommand,
  'db:reset': dbResetCommand,
  'db:seed': dbSeedCommand,
  'db:setup': dbSetupCommand,
  'db:schema:load': dbSchemaLoadCommand,
  'db:schema:dump': dbSchemaDumpCommand,

  'dev': devCommand,
  'server': devCommand, // alias
  's': devCommand, // alias

  'start': startCommand,

  'console': consoleCommand,
  'c': consoleCommand, // alias

  'routes': routesCommand,

  'test': testCommand,
  't': testCommand, // alias

  'credentials': credentialsCommand,
  'credentials:edit': credentialsCommand
}

/**
 * `brails db <command>`: the space form of `brails db:<command>`.
 */
commands.db = {
  name: 'db',
  description: 'Database commands (brails db:<command>)',

  async run(args) {
    const target = args.subcommand && commands[`db:${args.subcommand}`]
    if (!target) {
      throw new Error('Usage: brails db:<command>. Run `brails help` for the list')
    }
    return target.run({
      ...args,
      command: `db:${args.subcommand}`,
      subcommand: args.positional[0] ?? null,
      positional: args.positional.slice(1)
    })
  }
}
