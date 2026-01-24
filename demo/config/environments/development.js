/**
 * Development Environment Configuration
 */

export default {
  // Server
  server: {
    port: 3000,
    host: 'localhost'
  },

  // Logging
  logging: {
    level: 'debug',
    format: 'pretty'
  },

  // Cache
  cache: {
    store: 'memory'
  },

  // Session
  session: {
    store: 'memory',
    secret: 'dev-secret-change-in-production'
  },

  // Jobs
  jobs: {
    workers: 1,
    concurrency: 5,
    dashboard: true
  },

  // Mailer
  mailer: {
    adapter: 'smtp',
    host: 'localhost',
    port: 1025 // Mailhog
  },

  // Storage
  storage: {
    adapter: 'local',
    path: 'storage'
  },

  // Hot reload
  hotReload: true,

  // N+1 detection
  detectNPlusOne: true
}
