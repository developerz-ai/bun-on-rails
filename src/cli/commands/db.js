/**
 * brails db - Database commands
 */

export const dbCommand = {
  name: 'db',
  description: 'Database management commands',

  async run(args) {
    // Parse db:command format
    const fullCommand = args.command
    const subcommand = fullCommand.includes(':')
      ? fullCommand.split(':').slice(1).join(':')
      : args.subcommand

    if (!subcommand) {
      throw new Error('Please specify a database command: brails db:migrate')
    }

    const command = dbCommands[subcommand]
    if (!command) {
      throw new Error(`Unknown database command: ${subcommand}`)
    }

    await command(args)
  }
}

const dbCommands = {
  /**
   * Create database
   */
  create: async (_args) => {
    console.log('Creating database...')
    // TODO: Create database based on config
    console.log('Database created.')
  },

  /**
   * Drop database
   */
  drop: async (_args) => {
    console.log('Dropping database...')
    // TODO: Drop database
    console.log('Database dropped.')
  },

  /**
   * Run pending migrations
   */
  migrate: async (_args) => {
    console.log('Running migrations...')

    // TODO: Load migration runner
    // TODO: Run pending migrations
    // TODO: Update schema.js
    // TODO: Annotate models

    console.log('Migrations complete.')
  },

  /**
   * Rollback last migration
   */
  rollback: async (args) => {
    const steps = args.options.step || 1
    console.log(`Rolling back ${steps} migration(s)...`)

    // TODO: Rollback migrations

    console.log('Rollback complete.')
  },

  /**
   * Drop, create, and migrate
   */
  reset: async (args) => {
    console.log('Resetting database...')

    await dbCommands.drop(args)
    await dbCommands.create(args)
    await dbCommands.migrate(args)

    console.log('Database reset complete.')
  },

  /**
   * Load seed data
   */
  seed: async (_args) => {
    console.log('Loading seed data...')

    // TODO: Load and run db/seeds.js

    console.log('Seed data loaded.')
  },

  /**
   * Create, migrate, and seed
   */
  setup: async (args) => {
    console.log('Setting up database...')

    await dbCommands.create(args)
    await dbCommands['schema:load'](args)
    await dbCommands.seed(args)

    console.log('Database setup complete.')
  },

  /**
   * Load schema without running migrations
   */
  'schema:load': async (_args) => {
    console.log('Loading schema...')

    // TODO: Load schema.js and apply

    console.log('Schema loaded.')
  },

  /**
   * Dump current schema
   */
  'schema:dump': async (_args) => {
    console.log('Dumping schema...')

    // TODO: Generate schema.js from database

    console.log('Schema dumped to db/schema.js')
  }
}
