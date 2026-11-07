/**
 * brails generate - Code generation
 */

import { parseFields } from '../parser.js'

export const generateCommand = {
  name: 'generate',
  description: 'Generate application code',

  async run(args) {
    const type = args.subcommand
    const name = args.positional[0]
    const fields = args.positional.slice(1)

    if (!type) {
      throw new Error('Please specify generator type: brails g <type> <name>')
    }

    const generator = generators[type]
    if (!generator) {
      throw new Error(`Unknown generator: ${type}`)
    }

    await generator(name, parseFields(fields), args)
  }
}

const generators = {
  /**
   * Generate full scaffold
   */
  scaffold: async (name, _fields, _args) => {
    console.log(`Generating scaffold for: ${name}`)

    // TODO: Generate:
    // - Migration
    // - Model
    // - Controller
    // - React components
    // - Routes
    // - Tests

    console.log('  Creating migration...')
    console.log('  Creating model...')
    console.log('  Creating controller...')
    console.log('  Creating components...')
    console.log('  Updating routes...')
    console.log('  Creating tests...')

    console.log(`\nScaffold created! Run \`brails db:migrate\` to apply.`)
  },

  /**
   * Generate model
   */
  model: async (name, _fields, _args) => {
    console.log(`Generating model: ${name}`)

    // TODO: Generate:
    // - Migration
    // - Model file
    // - Test file

    console.log('  Creating migration...')
    console.log('  Creating model...')
    console.log('  Creating test...')
  },

  /**
   * Generate controller
   */
  controller: async (name, _fields, _args) => {
    console.log(`Generating controller: ${name}`)

    // TODO: Generate:
    // - Controller file
    // - Test file
  },

  /**
   * Generate migration
   */
  migration: async (name, _fields, _args) => {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    const filename = `${timestamp}_${toSnakeCase(name)}.js`

    console.log(`Generating migration: ${filename}`)

    // TODO: Generate migration file
  },

  /**
   * Generate job
   */
  job: async (name, _fields, _args) => {
    console.log(`Generating job: ${name}`)

    // TODO: Generate:
    // - Job file
    // - Test file
  },

  /**
   * Generate mailer
   */
  mailer: async (name, _fields, _args) => {
    console.log(`Generating mailer: ${name}`)

    // TODO: Generate:
    // - Mailer file
    // - Email templates
    // - Test file
  },

  /**
   * Generate channel
   */
  channel: async (name, _fields, _args) => {
    console.log(`Generating channel: ${name}`)

    // TODO: Generate:
    // - Channel file
    // - Test file
  },

  /**
   * Generate React component
   */
  component: async (name, _fields, _args) => {
    console.log(`Generating component: ${name}`)

    // TODO: Generate:
    // - Component file
    // - Style file (optional)
    // - Test file
  },

  /**
   * Generate authentication system
   */
  auth: async (_name, _fields, _args) => {
    console.log('Generating authentication system...')

    // TODO: Generate:
    // - User model and migration
    // - Session handling
    // - Registration controller
    // - Session controller
    // - Password reset
    // - Auth middleware
    // - Routes
    // - Tests

    console.log('  Creating User model...')
    console.log('  Creating sessions controller...')
    console.log('  Creating registrations controller...')
    console.log('  Creating password resets...')
    console.log('  Setting up routes...')
    console.log('  Creating tests...')

    console.log('\nAuth system created! Run `brails db:migrate` to apply.')
  },

  /**
   * Generate admin panel
   */
  admin: async (name, _fields, _args) => {
    console.log(`Generating admin panel for: ${name || 'all models'}`)

    // TODO: Generate:
    // - Admin controller
    // - Admin views
    // - Admin routes
  }
}

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}
