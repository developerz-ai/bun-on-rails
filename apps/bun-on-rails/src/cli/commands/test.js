/**
 * brails test - Run tests
 */

export const testCommand = {
  name: 'test',
  description: 'Run tests',

  async run(args) {
    const filter = args.subcommand
    const watch = args.flags.watch || args.flags.w

    console.log('Running tests...\n')

    // TODO: Set up test environment
    // TODO: Create test databases for parallel workers
    // TODO: Run Bun test runner
    // TODO: Show results

    const bunArgs = ['test']

    if (watch) {
      bunArgs.push('--watch')
    }

    if (filter) {
      bunArgs.push('--filter', filter)
    }

    // TODO: Execute: bun test ...args

    console.log('Tests complete.')
  }
}
