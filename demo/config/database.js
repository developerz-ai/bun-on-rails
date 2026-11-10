/**
 * Database Configuration
 *
 * The app connects at boot only when DATABASE_URL is set; without it, it runs
 * with no database (bin/dev and the test suite need none).
 */

export default {
  development: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    logging: true
  },

  test: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
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
