/**
 * brails console - Interactive REPL
 */

export const consoleCommand = {
  name: 'console',
  description: 'Start interactive console with models loaded',

  async run(args) {
    console.log('Loading BunOnRails console...')

    // TODO: Load application
    // TODO: Load all models
    // TODO: Connect to database
    // TODO: Start Bun REPL with context

    console.log(`
BunOnRails Console (${process.env.NODE_ENV || 'development'})

Models loaded: User, Post, Comment, ...
Type .help for commands

>
`)

    // TODO: Start REPL
  }
}
