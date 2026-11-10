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

  // Jobs
  jobs: {
    workers: process.env.JOB_WORKERS || 2,
    concurrency: process.env.JOB_CONCURRENCY || 10,
    dashboard: false
  },

  // Mailer
  mailer: {
    adapter: process.env.MAILER_ADAPTER || 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY
  },

  // Storage
  storage: {
    adapter: 's3',
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },

  // Security
  forceSSL: true,

  // Asset host (CDN)
  assetHost: process.env.ASSET_HOST
}
