/**
 * A registered `brails` command whose implementation has not landed yet.
 *
 * It fails loudly (src/cli/index.js turns the throw into exit 1) instead of
 * printing the output of work it never did. Pinned by
 * test/cli/not_implemented.test.js.
 */

/**
 * @param {string} name - registry name, shown by `brails help`
 * @param {string} description - one line for `brails help`
 * @param {string} [hint] - what to do instead, appended to the error
 * @returns {{ name: string, description: string, implemented: false, run: (args: Object) => Promise<never> }}
 */
export function notImplemented(name, description, hint) {
  return {
    name,
    description,
    implemented: false,

    async run(args) {
      const typed = args?.command || name
      throw new Error(`brails ${typed} is not implemented yet${hint ? `. ${hint}` : ''}`)
    }
  }
}
