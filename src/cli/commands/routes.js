/**
 * brails routes [filter]: list the app's routes, in the order they match.
 *
 * Loads config/routes.js into a Router (no server, no database) and prints a
 * table of verb, path, controller#action and name. A filter keeps rows whose
 * path or controller#action contains it. Pinned by test/cli/routes.test.js.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { Router } from '../../routing/router.js'
import { resolveAppRoot } from './dev.js'

/**
 * The routes `config/routes.js` defines for the app at `root`.
 *
 * @param {string} root - application root
 * @returns {Promise<Array<{ method: string, path: string, target: string, name: string }>>}
 */
export async function listRoutes(root) {
  const routesFile = join(root, 'config', 'routes.js')
  if (!existsSync(routesFile)) {
    throw new Error(`config/routes.js not found in ${root}`)
  }
  const router = new Router()
  const routesModule = await import(routesFile)
  const define = routesModule.default ?? routesModule
  if (typeof define !== 'function') {
    throw new Error('config/routes.js must default-export a function that receives the router')
  }
  define(router)
  return router.routes.map((route) => ({
    method: route.method,
    path: route.path,
    target: `${route.controller}#${route.action}`,
    name: route.options?.as ?? ''
  }))
}

/**
 * Format rows as an aligned table with a header.
 *
 * @param {Array<{ method: string, path: string, target: string, name: string }>} rows
 * @returns {string}
 */
export function formatRoutes(rows) {
  const header = { method: 'Verb', path: 'Path', target: 'Controller#Action', name: 'Name' }
  const all = [header, ...rows]
  const width = (key) => Math.max(...all.map((row) => row[key].length))
  const [m, p, t] = [width('method'), width('path'), width('target')]
  return all
    .map((row) => `${row.method.padEnd(m)}  ${row.path.padEnd(p)}  ${row.target.padEnd(t)}  ${row.name}`.trimEnd())
    .join('\n')
}

export const routesCommand = {
  name: 'routes',
  description: 'List all application routes',

  async run(args) {
    const filter = args.subcommand
    let rows = await listRoutes(resolveAppRoot())
    if (filter) {
      rows = rows.filter((row) => row.path.includes(filter) || row.target.includes(filter))
    }
    if (rows.length === 0) {
      console.log(filter ? `No routes match "${filter}".` : 'No routes defined in config/routes.js.')
      return
    }
    console.log(formatRoutes(rows))
  }
}
