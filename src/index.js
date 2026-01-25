/**
 * BunOnRails Framework
 * @module @bun-on-rails
 */

export { Application, createApplication } from './application.js'
export { Model } from './database/model.js'
export { Controller } from './controller/base.js'
export { Router } from './routing/router.js'
export { Job } from './jobs/job.js'
export { Mailer } from './mail/mailer.js'
export { Channel } from './websocket/channel.js'
export { Cache } from './cache/cache.js'
export { Storage } from './storage/storage.js'

// Configuration
export {
  Config,
  createConfig,
  loadConfig,
  getConfig,
  setConfig,
  getEnvironment,
  isDevelopment,
  isProduction,
  isTest,
  defaultConfig
} from './config/loader.js'

// React integration
export { useResource, useAction, useChannel } from './react/hooks.js'
export { Form, Field } from './react/forms.js'

// Testing utilities
export { factory, request, cleanDatabase, setupDatabase, withinTransaction } from './testing/index.js'
