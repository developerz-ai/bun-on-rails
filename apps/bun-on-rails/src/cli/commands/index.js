/**
 * CLI Commands Registry
 */

import { newCommand } from './new.js'
import { generateCommand } from './generate.js'
import { dbCommand } from './db.js'
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

  'db': dbCommand,
  'db:create': dbCommand,
  'db:drop': dbCommand,
  'db:migrate': dbCommand,
  'db:rollback': dbCommand,
  'db:reset': dbCommand,
  'db:seed': dbCommand,
  'db:setup': dbCommand,
  'db:schema:load': dbCommand,
  'db:schema:dump': dbCommand,

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
