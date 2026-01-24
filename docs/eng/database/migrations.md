# Migrations

Migrations are version-controlled database changes. Each migration describes what to add, remove, or modify.

## Creating Migrations

### Using the Generator

```bash
# Create a table
brails g migration CreatePosts

# Add a column
brails g migration AddSlugToPosts slug:string

# Remove a column
brails g migration RemovePublishedFromPosts published:boolean

# Create a reference
brails g migration AddUserToPosts user:references
```

### Manual Creation

Create a file in `db/migrations/` with a timestamp prefix:

```javascript
// db/migrations/20250124120000_create_posts.js
export async function up(db) {
  await db.createTable('posts', (t) => {
    t.id()
    t.string('title').notNull()
    t.text('body')
    t.boolean('published').default(false)
    t.references('user').notNull().onDelete('cascade')
    t.timestamps()
  })

  await db.addIndex('posts', ['user_id'])
  await db.addIndex('posts', ['published', 'created_at'])
}

export async function down(db) {
  await db.dropTable('posts')
}
```

## Column Types

| Type | SQL | Example |
|------|-----|---------|
| `id()` | BIGSERIAL PRIMARY KEY | Auto-incrementing ID |
| `string(name)` | VARCHAR(255) | `t.string('title')` |
| `text(name)` | TEXT | `t.text('body')` |
| `integer(name)` | INTEGER | `t.integer('count')` |
| `bigint(name)` | BIGINT | `t.bigint('views')` |
| `float(name)` | FLOAT | `t.float('rating')` |
| `decimal(name)` | DECIMAL(p,s) | `t.decimal('price', 10, 2)` |
| `boolean(name)` | BOOLEAN | `t.boolean('active')` |
| `date(name)` | DATE | `t.date('published_on')` |
| `datetime(name)` | TIMESTAMP | `t.datetime('starts_at')` |
| `json(name)` | JSONB | `t.json('metadata')` |
| `uuid(name)` | UUID | `t.uuid('token')` |
| `references(name)` | BIGINT + FK | `t.references('user')` |
| `timestamps()` | created_at, updated_at | Auto timestamps |

## Column Modifiers

```javascript
t.string('email')
  .notNull()              // NOT NULL constraint
  .unique()               // UNIQUE constraint
  .default('value')       // DEFAULT value

t.references('user')
  .notNull()
  .onDelete('cascade')    // ON DELETE CASCADE
  .onUpdate('restrict')   // ON UPDATE RESTRICT
```

## Running Migrations

```bash
# Run all pending migrations
brails db:migrate

# Rollback last migration
brails db:rollback

# Rollback multiple
brails db:rollback --step=3

# Reset database (drop, create, migrate)
brails db:reset

# Load schema without running migrations (fast)
brails db:schema:load
```

## Modifying Tables

```javascript
export async function up(db) {
  // Add column
  await db.addColumn('posts', 'slug', 'string', { notNull: true })

  // Remove column
  await db.removeColumn('posts', 'legacy_field')

  // Rename column
  await db.renameColumn('posts', 'name', 'title')

  // Change column type
  await db.changeColumn('posts', 'views', 'bigint')

  // Add index
  await db.addIndex('posts', ['slug'], { unique: true })

  // Remove index
  await db.removeIndex('posts', 'index_posts_on_slug')

  // Add foreign key
  await db.addForeignKey('posts', 'users', {
    column: 'author_id',
    primaryKey: 'id',
    onDelete: 'cascade'
  })
}
```

## Data Migrations

For data changes, use the migration's database connection:

```javascript
export async function up(db) {
  // Update existing data
  await db.query(`
    UPDATE posts
    SET slug = lower(replace(title, ' ', '-'))
    WHERE slug IS NULL
  `)
}
```

## Best Practices

1. **Keep migrations small** - One change per migration
2. **Always write down()** - Enable rollback
3. **Don't modify old migrations** - Create new ones instead
4. **Use db:schema:load in CI** - Faster than running all migrations
5. **Test rollbacks** - Verify down() works correctly

## After Migration

After each migration, BunOnRails automatically:

1. **Updates `db/schema.js`** - Current database structure
2. **Annotates models** - Adds schema comments to model files
3. **Verifies integrity** - Checks for issues

This keeps everything in sync without manual work.
