/**
 * CLI Argument Parser
 */

/**
 * Parse CLI arguments
 * @param {string[]} args
 * @returns {Object}
 */
export function parseArgs(args) {
  const result = {
    command: null,
    subcommand: null,
    positional: [],
    flags: {},
    options: {}
  }

  let i = 0

  while (i < args.length) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      // Long flag or option
      const [key, value] = arg.slice(2).split('=')
      if (value !== undefined) {
        result.options[key] = value
      } else if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.options[key] = args[++i]
      } else {
        result.flags[key] = true
      }
    } else if (arg.startsWith('-')) {
      // Short flag(s)
      const flags = arg.slice(1)
      for (const f of flags) {
        result.flags[f] = true
      }
    } else if (!result.command) {
      result.command = arg
    } else if (!result.subcommand) {
      result.subcommand = arg
    } else {
      result.positional.push(arg)
    }

    i++
  }

  return result
}

/**
 * Parse field definitions from generator
 * @param {string[]} fields - e.g., ['title:string', 'body:text']
 * @returns {Object[]}
 */
export function parseFields(fields) {
  return fields.map(field => {
    const [name, type = 'string'] = field.split(':')
    const options = {}

    // Handle references
    if (type === 'references' || type === 'belongs_to') {
      return {
        name: `${name}_id`,
        type: 'bigint',
        reference: name,
        options: { notNull: true }
      }
    }

    return { name, type, options }
  })
}
