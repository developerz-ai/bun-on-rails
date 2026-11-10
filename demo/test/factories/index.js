/**
 * Test Factories
 */

import { factory } from '../../../src/index.js'
// Importing a model registers it (Model.register()), so each factory below
// finds the model named after it: 'user' is User, 'post' is Post.
import '../../app/models/user.js'
import '../../app/models/post.js'
import '../../app/models/comment.js'

// User factory (password_digest is NOT NULL; authentication is planned)
factory.define('user', {
  email: (f) => `user${f.sequence('user')}@example.com`,
  name: 'Test User',
  password_digest: 'not-a-real-digest',
  role: 'user'
})

factory.define('admin', {
  email: (f) => `admin${f.sequence('admin')}@example.com`,
  name: 'Admin User',
  password_digest: 'not-a-real-digest',
  role: 'admin'
}, { model: 'User' })

// Post factory
factory.define('post', {
  title: (f) => `Test Post ${f.sequence('post')}`,
  body: 'This is test post content.',
  slug: (f) => `test-post-${f.sequence('post')}`,
  published: false,
  user_id: async (f) => (await f.create('user')).id
})

factory.define('published_post', {
  title: (f) => `Published Post ${f.sequence('published_post')}`,
  body: 'This is published post content.',
  slug: (f) => `published-post-${f.sequence('published_post')}`,
  published: true,
  published_at: () => new Date(),
  user_id: async (f) => (await f.create('user')).id
}, { model: 'Post' })

// Comment factory
factory.define('comment', {
  body: 'This is a test comment.',
  post_id: async (f) => (await f.create('post')).id,
  user_id: async (f) => (await f.create('user')).id
})

export { factory }
