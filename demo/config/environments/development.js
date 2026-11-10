/**
 * Development Environment Configuration
 */

export default {
  server: {
    port: 3000,
    host: 'localhost'
  },

  logging: {
    level: 'debug',
    format: 'pretty'
  },

  cache: {
    store: 'memory'
  },

  session: {
    store: 'memory',
    secret: 'dev-secret-change-in-production'
  }
}
