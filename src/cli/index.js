#!/usr/bin/env bun
/**
 * BunOnRails CLI - brails command
 */

import { parseArgs } from './parser.js'
import { commands } from './commands/index.js'
import { printHelp, printVersion } from './help.js'

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.flags.version || args.flags.v) {
    printVersion()
    process.exit(0)
  }

  if (args.flags.help || args.flags.h || args.command === 'help') {
    printHelp(args.subcommand)
    process.exit(0)
  }

  const command = commands[args.command]

  if (!command) {
    console.error(`Unknown command: ${args.command}`)
    console.error('Run `brails help` for available commands')
    process.exit(1)
  }

  try {
    await command.run(args)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    if (args.flags.verbose) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
