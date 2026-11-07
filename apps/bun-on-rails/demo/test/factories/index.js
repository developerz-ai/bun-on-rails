/**
 * Test Factories
 */

import { factory } from '../../../src/index.js'

// User factory
factory.define('user', {
  email: (f) => `user${f.sequence('user')}@example.com`,
  name: 'Test User',
  password: 'password123',
  role: 'user'
})

factory.define('admin', {
  email: (f) => `admin${f.sequence('admin')}@example.com`,
  name: 'Admin User',
  password: 'password123',
  role: 'admin'
})

// Post factory
factory.define('post', {
  title: (f) => `Test Post ${f.sequence('post')}`,
  body: 'This is test post content.',
  slug: (f) => `test-post-${f.sequence('post')}`,
  published: false,
  userId: async (f) => {
    const user = await f.create('user')
    return user.id
  }
})

factory.define('published_post', {
  title: (f) => `Published Post ${f.sequence('published_post')}`,
  body: 'This is published post content.',
  slug: (f) => `published-post-${f.sequence('published_post')}`,
  published: true,
  publishedAt: () => new Date(),
  userId: async (f) => {
    const user = await f.create('user')
    return user.id
  }
})

// Comment factory
factory.define('comment', {
  body: 'This is a test comment.',
  postId: async (f) => {
    const post = await f.create('post')
    return post.id
  },
  userId: async (f) => {
    const user = await f.create('user')
    return user.id
  }
})

export { factory }
