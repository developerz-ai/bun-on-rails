/**
 * Database Configuration
 */

export default {
  development: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/demo_development',
    pool: {
      min: 2,
      max: 10
    },
    logging: true
  },

  test: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/demo_test',
    pool: {
      min: 1,
      max: 5
    },
    logging: false
  },

  production: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
    pool: {
      min: 5,
      max: 20
    },
    ssl: {
      rejectUnauthorized: false
    },
    logging: false
  }
}
