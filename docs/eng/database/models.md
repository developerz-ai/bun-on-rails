# Models

Models are the heart of your application's data layer. Each model represents a database table and provides methods to query and manipulate data.

## Creating Models

### Using the Generator

```bash
brails g model Post title:string body:text published:boolean user:references
```

### Manual Creation

```javascript
// app/models/post.js
import { Model } from '@bun-on-rails'

export default class Post extends Model {
  // Configuration is optional - conventions handle most cases
}
```

## Model Annotations

After running migrations, models are automatically annotated with their schema:

```javascript
/**
 * Post Model
 *
 * == Schema Information
 *
 * Table name: posts
 *
 *  id           :bigint           not null, primary key
 *  title        :string           not null
 *  body         :text
 *  published    :boolean          default(false)
 *  user_id      :bigint           not null
 *  created_at   :datetime         not null
 *  updated_at   :datetime         not null
 *
 * Indexes:
 *  index_posts_on_user_id  (user_id)
 */

export default class Post extends Model {
  // ...
}
```

## CRUD Operations

### Create

```javascript
// Create and save
const post = await Post.create({
  title: 'Hello',
  body: 'World',
  userId: 1
})

// Build without saving
const post = new Post({ title: 'Hello' })
await post.save()

// Create multiple
const posts = await Post.createMany([
  { title: 'First' },
  { title: 'Second' }
])
```

### Read

```javascript
// Find by ID
const post = await Post.find(1)

// Find by attributes
const post = await Post.findBy({ slug: 'hello-world' })

// Find all
const posts = await Post.findAll()

// First/Last
const first = await Post.first()
const last = await Post.last()

// With conditions
const posts = await Post.where({ published: true }).all()
```

### Update

```javascript
// Update attributes
post.title = 'New Title'
await post.save()

// Update with hash
await post.update({ title: 'New Title' })

// Update all matching
await Post.where({ draft: true }).updateAll({ status: 'pending' })
```

### Delete

```javascript
// Delete single record
await post.destroy()

// Delete by ID
await Post.destroy(1)

// Delete all matching
await Post.where({ spam: true }).destroyAll()
```

## Attributes

### Accessing Attributes

```javascript
const post = await Post.find(1)

// Read
console.log(post.title)
console.log(post.createdAt)

// Write
post.title = 'Updated'

// All attributes
console.log(post.attributes)
```

### Dirty Tracking

```javascript
const post = await Post.find(1)
post.title = 'Changed'

post.changed()           // ['title']
post.titleChanged()      // true
post.titleWas            // 'Original'
post.changes             // { title: ['Original', 'Changed'] }
```

## Callbacks

Callbacks run at specific points in the model lifecycle:

```javascript
export default class Post extends Model {
  async beforeValidate() {
    // Runs before validation
    if (!this.slug) {
      this.slug = this.title.toLowerCase().replace(/\s+/g, '-')
    }
  }

  async afterValidate() {
    // Runs after validation passes
  }

  async beforeSave() {
    // Runs before create or update
  }

  async afterSave() {
    // Runs after successful save
  }

  async beforeCreate() {
    // Runs only on new records
  }

  async afterCreate() {
    // Runs after new record is saved
    await SendWelcomeEmailJob.performLater({ userId: this.id })
  }

  async beforeUpdate() {
    // Runs only on existing records
  }

  async afterUpdate() {
    // Runs after update is saved
  }

  async beforeDestroy() {
    // Runs before deletion
  }

  async afterDestroy() {
    // Runs after deletion
    await this.cleanupAttachments()
  }
}
```

## Scopes

Scopes encapsulate common queries:

```javascript
export default class Post extends Model {
  static scopes = {
    published: (query) => query.where({ published: true }),
    draft: (query) => query.where({ published: false }),
    recent: (query) => query.order({ createdAt: 'desc' }),
    byAuthor: (query, userId) => query.where({ userId }),
    popular: (query) => query.where('views > ?', 1000)
  }
}

// Usage
const posts = await Post.published().recent().limit(10)
const drafts = await Post.byAuthor(currentUser.id).draft()
```

## Class Methods

Add custom class methods for domain logic:

```javascript
export default class Post extends Model {
  static async findBySlugOrId(identifier) {
    if (isNaN(identifier)) {
      return await this.findBy({ slug: identifier })
    }
    return await this.find(identifier)
  }

  static async trending() {
    return await this
      .published()
      .where('created_at > ?', oneWeekAgo())
      .order({ views: 'desc' })
      .limit(10)
  }
}
```

## Instance Methods

Add custom instance methods:

```javascript
export default class Post extends Model {
  get excerpt() {
    return this.body.substring(0, 200) + '...'
  }

  get isPublished() {
    return this.published && this.publishedAt <= new Date()
  }

  async publish() {
    this.published = true
    this.publishedAt = new Date()
    return await this.save()
  }

  async addComment(userId, body) {
    return await Comment.create({
      postId: this.id,
      userId,
      body
    })
  }
}
```

## Conventions

| Convention | Example |
|------------|---------|
| Table name | `posts` (plural, snake_case) |
| Primary key | `id` |
| Foreign keys | `user_id` |
| Timestamps | `created_at`, `updated_at` |
| Model file | `app/models/post.js` |
| Model class | `Post` (singular, PascalCase) |

### Overriding Conventions

```javascript
export default class LegacyUser extends Model {
  static tableName = 'tbl_users'
  static primaryKey = 'user_id'
}
```
