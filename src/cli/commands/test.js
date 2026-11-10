/**
 * brails test (t): run the app's tests with bun test.
 *
 * Runs `bun test` in the app root with NODE_ENV=test. Every argument after
 * `test` passes through unchanged (`brails test test/models -t slug`), taken
 * from the raw argv because the CLI parser would split `-t "a name"` into
 * flags. Exits with bun test's exit code. Pinned by
 * test/cli/test_command.test.js.
 */

import { resolveAppRoot } from './dev.js'

/** The raw arguments after the command name (`test` or `t`). */
function passthrough(command, argv = process.argv.slice(2)) {
  return argv.slice(argv.indexOf(command) + 1)
}

export const testCommand = {
  name: 'test',
  description: 'Run the tests with bun test',

  async run(args) {
    const proc = Bun.spawn([process.execPath, 'test', ...passthrough(args.command)], {
      cwd: resolveAppRoot(),
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['inherit', 'inherit', 'inherit']
    })
    process.exitCode = await proc.exited
  }
}
