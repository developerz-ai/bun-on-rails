/**
 * brails generate (g): migration, model and controller generators.
 *
 *   brails g migration CreateTags name:string     db/migrations/<timestamp>_create_tags.js
 *   brails g model Post title:string user:references
 *                                                 app/models/post.js + its create_posts migration
 *   brails g controller Posts index show          app/controllers/posts_controller.js
 *
 * Existing files are never overwritten. Other generator types (scaffold, auth,
 * ...) are not implemented yet. Pinned by test/cli/generate.test.js.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { pascalize, tableize, underscore } from '../../support/inflector.js'
import { resolveAppRoot } from './dev.js'

/** Column types a field may use: the TableBuilder methods that take a column name. */
const COLUMN_TYPES = new Set([
  'string', 'text', 'integer', 'bigint', 'smallint', 'float', 'double', 'decimal', 'numeric',
  'boolean', 'date', 'datetime', 'time', 'timestamp', 'json', 'jsonb', 'uuid', 'binary'
])

const IMPLEMENTED = ['migration', 'model', 'controller']

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

function generateModel(root, name, fields, now, created) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name || '')) {
    throw new Error('Usage: brails generate model <Name> [field:type ...]; <Name> is singular PascalCase, e.g. Post')
  }
  if (name === 'Model') {
    // The file imports `Model` from the framework; a class of the same name cannot sit beside it.
    throw new Error('"Model" is the base class every model extends; choose another name')
  }
  const references = fields.filter((f) => f.reference).map((f) => `'${f.name}'`)
  const body = references.length > 0 ? ` {\n  static associations = { belongsTo: [${references.join(', ')}] }\n}` : ' {}'
  writeNew(
    root,
    join('app', 'models', `${underscore(name)}.js`),
    `import { Model } from 'bun-on-rails'\n\nexport default class ${name} extends Model${body}\n`,
    created
  )
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
  } else if (!type) {
    throw new Error(`Usage: brails generate <${IMPLEMENTED.join('|')}> <Name> ...`)
  } else {
    throw new Error(`brails generate ${type} is not implemented yet. Available: ${IMPLEMENTED.join(', ')}`)
  }
  return created
}

export const generateCommand = {
  name: 'generate',
  description: 'Generate a migration, model or controller',

  async run(args) {
    const [name, ...rest] = args.positional
    const created = generate(resolveAppRoot(), args.subcommand, name, rest)
    for (const file of created) {
      console.log(`  create  ${file}`)
    }
  }
}
