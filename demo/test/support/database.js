/**
 * A database of the tests' own on the TEST_DATABASE_URL server.
 *
 * Tests that need PostgreSQL run when TEST_DATABASE_URL names a server (CI's
 * demo job sets it; bin/check skips them without it). useTestDatabase()
 * creates a database there, points config/database.js's DATABASE_URL at it,
 * and runs the migrations through setupDatabase(); dropTestDatabase() drops
 * it. So a run never migrates into or empties a database you use.
 */

import { join } from 'path'
import { setupDatabase, getConnection, setConnection } from '../../../src/index.js'
import { createDatabase, dropDatabase } from '../../../src/cli/commands/db.js'

export const serverUrl = process.env.TEST_DATABASE_URL
export const root = join(import.meta.dir, '..', '..')

let connection = null

export async function useTestDatabase() {
  const url = new URL(serverUrl)
  url.pathname = `/demo_test_${process.pid}_${Date.now()}`
  process.env.DATABASE_URL = url.toString()
  await createDatabase(root)
  connection = await setupDatabase({ root })
  return connection
}

export async function dropTestDatabase() {
  // An app booted in the test opens its own connection and makes it the
  // global one; both keep the database in use, so close both before the drop.
  for (const open of new Set([getConnection(), connection])) {
    await open?.disconnect()
  }
  connection = null
  setConnection(null)
  await dropDatabase(root)
}
