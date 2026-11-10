/**
 * BunOnRails Framework
 * @module bun-on-rails
 */

export { Application, createApplication } from './application.js'
export { Model, RecordNotFoundError, PaginatedResult } from './database/model.js'
export { QueryBuilder } from './database/query_builder.js'
export { Migration, MigrationRunner, TableBuilder, ColumnBuilder } from './database/migration.js'
export { SchemaGenerator, SchemaLoader, dumpSchema, loadSchema } from './database/schema.js'
export { Connection, ConnectionPool, getConnection, setConnection } from './database/connection.js'
export { Validators, runValidations, addValidator, removeValidator, getValidatorNames } from './database/validations.js'
export {
  N1QueryDetector,
  trackQuery,
  configureN1Detection,
  enableN1Detection,
  disableN1Detection,
  resetN1Detection,
  getN1Stats
} from './database/n_plus_one_detector.js'
export { Controller, ControllerContext, RequestParams } from './controller/base.js'
export { MiddlewareStack, ControllerMiddleware, Middleware, createDefaultMiddlewareStack } from './controller/middleware.js'
export {
  parseRequest,
  parseQueryString,
  parseBody,
  requestParserMiddleware,
  RequestParams as StrongParams
} from './controller/request_parser.js'
export { Router } from './routing/router.js'
export { Job } from './jobs/job.js'
export { Mailer } from './mail/mailer.js'
export { Channel } from './websocket/channel.js'
export { BroadcastManager, createBroadcastManager } from './websocket/broadcast_manager.js'
export { Cache } from './cache/cache.js'
export { Storage } from './storage/storage.js'
export { NotImplementedError } from './support/not_implemented.js'

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
