/**
 * Migration: Create Posts Table
 */

export async function up(db) {
  await db.createTable('posts', (t) => {
    t.id()
    t.string('title').notNull()
    t.text('body').notNull()
    t.string('slug').notNull()
    t.boolean('published').default(false)
    t.datetime('published_at')
    t.references('user').notNull().onDelete('cascade')
    t.timestamps()
  })

  await db.addIndex('posts', ['slug'], { unique: true })
  await db.addIndex('posts', ['user_id'])
  await db.addIndex('posts', ['published', 'published_at'])
}

export async function down(db) {
  await db.dropTable('posts')
}
