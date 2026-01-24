/**
 * Migration: Create Users Table
 */

export async function up(db) {
  await db.createTable('users', (t) => {
    t.id()
    t.string('email').notNull().unique()
    t.string('name')
    t.string('password_digest').notNull()
    t.string('role').default('user')
    t.string('reset_password_token')
    t.datetime('reset_password_sent_at')
    t.string('confirmation_token')
    t.datetime('confirmed_at')
    t.integer('failed_attempts').default(0)
    t.datetime('locked_at')
    t.timestamps()
  })

  await db.addIndex('users', ['email'], { unique: true })
  await db.addIndex('users', ['reset_password_token'], { unique: true })
  await db.addIndex('users', ['confirmation_token'], { unique: true })
}

export async function down(db) {
  await db.dropTable('users')
}
