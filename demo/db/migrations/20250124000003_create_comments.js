/**
 * Migration: Create Comments Table
 */

export async function up(db) {
  await db.createTable('comments', (t) => {
    t.id()
    t.text('body').notNull()
    t.references('post').notNull().onDelete('cascade')
    t.references('user').notNull().onDelete('cascade')
    t.timestamps()
  })

  await db.addIndex('comments', ['post_id'])
  await db.addIndex('comments', ['user_id'])
  await db.addIndex('comments', ['created_at'])
}

export async function down(db) {
  await db.dropTable('comments')
}
