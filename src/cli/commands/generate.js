/**
 * brails generate (g): migration, model and controller generators.
 *
 *   brails g migration CreateTags name:string     db/migrations/<timestamp>_create_tags.js
 *   brails g model Post title:string user:references
 *                                                 app/models/post.js + its create_posts migration
 *   brails g controller Posts index show          app/controllers/posts_controller.js
 *   brails g scaffold Post title:string body:text the model and migration, a JSON
 *                                                 controller, a request test, and
 *                                                 router.resources('posts')
 *
 * Existing files are never overwritten. Other generator types (job, mailer,
 * auth, ...) are not implemented yet. Pinned by test/cli/generate.test.js and
 * test/cli/scaffold.test.js.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { camelize, capitalize, pascalize, tableize, underscore } from '../../support/inflector.js'
import { resolveAppRoot } from './dev.js'

/** Column types a field may use: the TableBuilder methods that take a column name. */
const COLUMN_TYPES = new Set([
  'string', 'text', 'integer', 'bigint', 'smallint', 'float', 'double', 'decimal', 'numeric',
  'boolean', 'date', 'datetime', 'time', 'timestamp', 'json', 'jsonb', 'uuid', 'binary'
])

const IMPLEMENTED = ['migration', 'model', 'controller', 'scaffold']

/**
 * Parse `name:type` field arguments. `user:references` (or `belongs_to`)
 * becomes a reference to `users`.
 */
function parseFieldArgs(args) {
  return args.map((arg) => {
    const [name, type = 'string'] = arg.split(':')
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid field name "${name}" in "${arg}": use snake_case`)
    }
    if (type === 'references' || type === 'belongs_to') {
      return { name, reference: true }
    }
    if (!COLUMN_TYPES.has(type)) {
      throw new Error(`Unknown column type "${type}" in "${arg}". Types: ${[...COLUMN_TYPES].join(', ')}, references`)
    }
    return { name, type }
  })
}

/** YYYYMMDDHHMMSS in UTC, the migration version format. */
function timestamp(now) {
  return now.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

/**
 * A migration version at or after `now` that no file in db/migrations uses.
 * MigrationRunner keys on the version, so two migrations generated in the same
 * second must not share one.
 */
function nextVersion(root, now) {
  const dir = join(root, 'db', 'migrations')
  const taken = new Set(existsSync(dir) ? readdirSync(dir).map((f) => f.split('_')[0]) : [])
  let at = now.getTime()
  while (taken.has(timestamp(new Date(at)))) at += 1000
  return timestamp(new Date(at))
}

function columnLines(fields) {
  return fields.map((f) => (f.reference ? `    t.references('${f.name}')` : `    t.${f.type}('${f.name}')`))
}

function createTableMigration(table, fields) {
  return [
    'export async function up(db) {',
    `  await db.createTable('${table}', (t) => {`,
    '    t.id()',
    ...columnLines(fields),
    '    t.timestamps()',
    '  })',
    '}',
    '',
    'export async function down(db) {',
    `  await db.dropTable('${table}')`,
    '}',
    ''
  ].join('\n')
}

function emptyMigration() {
  return [
    'export async function up(db) {',
    '  // await db.query(...)',
    '}',
    '',
    'export async function down(db) {',
    '  // undo up()',
    '}',
    ''
  ].join('\n')
}

function writeNew(root, relative, content, created) {
  const path = join(root, relative)
  if (existsSync(path)) {
    throw new Error(`${relative} already exists; not overwriting it`)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  created.push(relative)
}

function generateMigration(root, name, fields, now, created) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name || '')) {
    throw new Error('Usage: brails generate migration <Name> [field:type ...], e.g. CreateTags name:string')
  }
  const snake = underscore(name)
  const create = snake.match(/^create_([a-z0-9_]+)$/)
  const content = create ? createTableMigration(create[1], fields) : emptyMigration()
  writeNew(root, join('db', 'migrations', `${nextVersion(root, now)}_${snake}.js`), content, created)
}

function checkModelName(name, generator) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name || '')) {
    throw new Error(`Usage: brails generate ${generator} <Name> [field:type ...]; <Name> is singular PascalCase, e.g. Post`)
  }
  if (name === 'Model') {
    // The file imports `Model` from the framework; a class of the same name cannot sit beside it.
    throw new Error('"Model" is the base class every model extends; choose another name')
  }
}

/** A model, registered so its associations and factories find it. */
function modelSource(name, fields) {
  const references = fields.filter((f) => f.reference).map((f) => `'${f.name}'`)
  const body = references.length > 0 ? ` {\n  static associations = { belongsTo: [${references.join(', ')}] }\n}` : ' {}'
  return `import { Model } from 'bun-on-rails'\n\nexport default class ${name} extends Model${body}\n\n${name}.register()\n`
}

function generateModel(root, name, fields, now, created) {
  checkModelName(name, 'model')
  writeNew(root, join('app', 'models', `${underscore(name)}.js`), modelSource(name, fields), created)
  const table = tableize(name)
  writeNew(
    root,
    join('db', 'migrations', `${nextVersion(root, now)}_create_${table}.js`),
    createTableMigration(table, fields),
    created
  )
}

function generateController(root, name, actions, created) {
  if (!/^[A-Za-z][A-Za-z0-9_/:]*$/.test(name || '')) {
    throw new Error('Usage: brails generate controller <Name> [action ...], e.g. Posts index show')
  }
  const segments = name.split(/::|\//).map((s) => underscore(s))
  const file = segments.pop()
  const className = `${pascalize(file)}Controller`
  for (const action of actions) {
    if (!/^[a-z][A-Za-z0-9_]*$/.test(action)) {
      throw new Error(`Invalid action name "${action}"`)
    }
  }
  const methods = actions.map((a) => `  ${a}() {\n    return this.render({})\n  }`).join('\n\n')
  const body = methods ? ` {\n${methods}\n}` : ' {}'
  writeNew(
    root,
    join('app', 'controllers', ...segments, `${file}_controller.js`),
    `import { Controller } from 'bun-on-rails'\n\nexport default class ${className} extends Controller${body}\n`,
    created
  )
}

/** A JSON controller with the five resource actions and a field whitelist. */
function scaffoldController(name, table, fields) {
  const key = underscore(name)
  const record = camelize(key)
  const permitted = fields.map((f) => `'${f.reference ? `${f.name}_id` : f.name}'`).join(', ')
  const find = `    const ${record} = await ${name}.findById(this.params.id)
    if (!${record}) {
      return this.notFound('${capitalize(key.replace(/_/g, ' '))} not found')
    }
`
  return `import { Controller, StrongParams } from 'bun-on-rails'
import ${name} from '../models/${key}.js'

export default class ${pascalize(table)}Controller extends Controller {
  /** GET /${table} */
  async index() {
    return this.render({ ${camelize(table)}: await ${name}.all() })
  }

  /** GET /${table}/:id */
  async show() {
${find}    return this.render({ ${record} })
  }

  /** POST /${table} */
  async create() {
    const ${record} = await ${name}.create(this.${record}Params())
    if (!${record}.persisted) {
      return this.unprocessableEntity(${record}.errors)
    }
    return this.render({ ${record} }, { status: 201 })
  }

  /** PATCH /${table}/:id */
  async update() {
${find}    if (!(await ${record}.update(this.${record}Params()))) {
      return this.unprocessableEntity(${record}.errors)
    }
    return this.render({ ${record} })
  }

  /** DELETE /${table}/:id */
  async destroy() {
${find}    await ${record}.destroy()
    return this.render({ deleted: true })
  }

  /** The fields a request may set; anything else in params.${key} is dropped. */
  ${record}Params() {
    return new StrongParams(this.params.${key} ?? {}).permit(${permitted}).toObject()
  }
}
`
}

/** A value for each column type, for the generated test's create request. */
function sampleValue(field) {
  const numbers = { integer: 1, bigint: 1, smallint: 1, float: 1.5, double: 1.5, decimal: 1.5, numeric: 1.5 }
  if (field.type in numbers) return numbers[field.type]
  if (field.type === 'boolean') return true
  if (field.type === 'date') return '2026-01-01'
  if (field.type === 'datetime' || field.type === 'timestamp') return '2026-01-01T00:00:00Z'
  if (field.type === 'time') return '12:00:00'
  if (field.type === 'json' || field.type === 'jsonb') return {}
  if (field.type === 'uuid') return '00000000-0000-0000-0000-000000000000'
  return capitalize(field.name.replace(/_/g, ' '))
}

/**
 * A request test on the database config/database.js names for the test
 * environment. It creates a record only when no field references another
 * table: a required foreign key needs a parent row the scaffold cannot know.
 */
function scaffoldTest(name, table, fields) {
  const key = underscore(name)
  const create = fields.some((f) => f.reference) || fields.some((f) => f.type === 'binary')
    ? ''
    : `
test('POST /${table} creates a ${key.replace(/_/g, ' ')}, and GET /${table}/:id shows it', () =>
  withinTransaction(async () => {
    const created = await request(app).post('/${table}', { ${key}: { ${fields.map((f) => `${f.name}: ${JSON.stringify(sampleValue(f))}`).join(', ')} } })
    expect(created.status).toBe(201)
    const { ${camelize(key)} } = await created.json()
    expect((await request(app).get(\`/${table}/\${${camelize(key)}.id}\`)).status).toBe(200)
  }))
`
  return `/**
 * ${pascalize(table)} - written by brails generate scaffold. Runs on the database
 * config/database.js names for the test environment (DATABASE_URL); each test
 * rolls back what it wrote.
 */

import { beforeAll, test, expect } from 'bun:test'
import { Application, request, setupDatabase, withinTransaction } from 'bun-on-rails'

let app

beforeAll(async () => {
  await setupDatabase()
  app = new Application({ root: process.cwd(), config: { logging: { level: 'error' } } })
  await app.initialize()
})

test('GET /${table} lists them', () =>
  withinTransaction(async () => {
    expect((await request(app).get('/${table}')).status).toBe(200)
  }))
${create}
test('GET /${table}/:id answers 404 for an id that does not exist', () =>
  withinTransaction(async () => {
    expect((await request(app).get('/${table}/0')).status).toBe(404)
  }))
`
}

/**
 * config/routes.js with router.resources(table) added before the closing
 * brace of its default export; null when the route is already there. Throws
 * when the file is missing or does not end that way, before anything is
 * written.
 */
function routesWithResource(root, table) {
  const file = join(root, 'config', 'routes.js')
  const line = `router.resources('${table}')`
  if (!existsSync(file)) {
    throw new Error(`config/routes.js not found; scaffold adds ${line} to it`)
  }
  const routes = readFileSync(file, 'utf8')
  if (new RegExp(`router\\.resources\\(\\s*['"]${table}['"]`).test(routes)) {
    return null
  }
  if (!/\n\}\s*$/.test(routes)) {
    throw new Error(
      `config/routes.js does not end with the closing brace of \`export default (router) => { ... }\`; add ${line} yourself`
    )
  }
  return routes.replace(/\n\}\s*$/, `\n  ${line}\n}\n`)
}

function generateScaffold(root, name, fields, now, created) {
  checkModelName(name, 'scaffold')
  const table = tableize(name)
  const files = [
    [join('app', 'models', `${underscore(name)}.js`), modelSource(name, fields)],
    [join('db', 'migrations', `${nextVersion(root, now)}_create_${table}.js`), createTableMigration(table, fields)],
    [join('app', 'controllers', `${table}_controller.js`), scaffoldController(name, table, fields)],
    [join('test', 'controllers', `${table}_controller.test.js`), scaffoldTest(name, table, fields)]
  ]
  // Check every target before writing any, so a conflict leaves the app as it was.
  const routes = routesWithResource(root, table)
  for (const [relative] of files) {
    if (existsSync(join(root, relative))) {
      throw new Error(`${relative} already exists; not overwriting it`)
    }
  }
  for (const [relative, content] of files) {
    writeNew(root, relative, content, created)
  }
  if (routes) {
    writeFileSync(join(root, 'config', 'routes.js'), routes)
    created.push(join('config', 'routes.js'))
  }
}

/**
 * Run a generator.
 *
 * @param {string} root - application root
 * @param {string} type - migration, model or controller
 * @param {string} name
 * @param {string[]} args - fields (migration, model) or actions (controller)
 * @param {{ now?: Date }} [options]
 * @returns {string[]} the files created, relative to root
 */
export function generate(root, type, name, args = [], { now = new Date() } = {}) {
  const created = []
  if (type === 'migration') {
    generateMigration(root, name, parseFieldArgs(args), now, created)
  } else if (type === 'model') {
    generateModel(root, name, parseFieldArgs(args), now, created)
  } else if (type === 'controller') {
    generateController(root, name, args, created)
  } else if (type === 'scaffold') {
    generateScaffold(root, name, parseFieldArgs(args), now, created)
  } else if (!type) {
    throw new Error(`Usage: brails generate <${IMPLEMENTED.join('|')}> <Name> ...`)
  } else {
    throw new Error(`brails generate ${type} is not implemented yet. Available: ${IMPLEMENTED.join(', ')}`)
  }
  return created
}

export const generateCommand = {
  name: 'generate',
  description: 'Generate a migration, model, controller or scaffold',

  async run(args) {
    const [name, ...rest] = args.positional
    const created = generate(resolveAppRoot(), args.subcommand, name, rest)
    for (const file of created) {
      console.log(`  create  ${file}`)
    }
  }
}
