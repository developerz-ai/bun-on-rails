/**
 * Production Environment Configuration
 */

export default {
  // Server
  server: {
    port: process.env.PORT || 3000,
    workers: process.env.WEB_CONCURRENCY || 'auto'
  },

  // Logging
  logging: {
    level: 'info',
    format: 'json'
  },

  // Cache and session: 'memory' is the only built-in store, one per process
  cache: {
    store: 'memory'
  },

  session: {
    store: 'memory',
    secret: process.env.SECRET_KEY_BASE
  },

  // Security
  forceSSL: true,

  // Asset host (CDN)
  assetHost: process.env.ASSET_HOST
}
