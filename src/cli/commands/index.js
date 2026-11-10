/**
 * CLI Commands Registry
 */

import { newCommand } from './new.js'
import { generateCommand } from './generate.js'
import { dbMigrateCommand, dbRollbackCommand } from './db.js'
import { notImplemented } from './not_implemented.js'
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
  'db:create': notImplemented('db:create', 'Create the database'),
  'db:drop': notImplemented('db:drop', 'Drop the database'),
  'db:reset': notImplemented('db:reset', 'Drop, create and migrate the database'),
  'db:seed': notImplemented('db:seed', 'Load db/seeds.js'),
  'db:setup': notImplemented('db:setup', 'Create the database, load the schema and seed'),
  'db:schema:load': notImplemented('db:schema:load', 'Load db/schema.js into the database'),
  'db:schema:dump': notImplemented('db:schema:dump', 'Write db/schema.js from the database'),

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
