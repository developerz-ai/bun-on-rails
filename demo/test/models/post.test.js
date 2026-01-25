/**
 * Post Model Tests
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { factory, cleanDatabase } from '../../../src/index.js'
import Post from '../../app/models/post.js'

describe('Post', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  describe('validations', () => {
    test('requires a title', async () => {
      const post = await Post.create({ body: 'content' })

      expect(post.errors.title).toBeDefined()
      expect(post.errors.title).toContain('is required')
    })

    test('requires a body', async () => {
      const post = await Post.create({ title: 'Test' })

      expect(post.errors.body).toBeDefined()
      expect(post.errors.body).toContain('is required')
    })

    test('requires unique slug', async () => {
      const user = await factory.create('user')

      await Post.create({
        title: 'Test Post',
        body: 'Content',
        slug: 'test-post',
        userId: user.id
      })

      const duplicate = await Post.create({
        title: 'Another Post',
        body: 'Content',
        slug: 'test-post',
        userId: user.id
      })

      expect(duplicate.errors.slug).toBeDefined()
      expect(duplicate.errors.slug).toContain('has already been taken')
    })
  })

  describe('scopes', () => {
    test('published scope returns only published posts', async () => {
      const user = await factory.create('user')

      await factory.create('post', { userId: user.id, published: true })
      await factory.create('post', { userId: user.id, published: true })
      await factory.create('post', { userId: user.id, published: false })

      const posts = await Post.published().all()

      expect(posts.length).toBe(2)
      expect(posts.every(p => p.published)).toBe(true)
    })

    test('recent scope orders by createdAt desc', async () => {
      const user = await factory.create('user')

      const older = await factory.create('post', { userId: user.id })
      const newer = await factory.create('post', { userId: user.id })

      const posts = await Post.recent().all()

      expect(posts[0].id).toBe(newer.id)
      expect(posts[1].id).toBe(older.id)
    })
  })

  describe('associations', () => {
    test('belongs to user', async () => {
      const user = await factory.create('user')
      const post = await factory.create('post', { userId: user.id })

      const author = await post.user()

      expect(author.id).toBe(user.id)
    })

    test('has many comments', async () => {
      const post = await factory.create('post')
      await factory.create('comment', { postId: post.id })
      await factory.create('comment', { postId: post.id })

      const comments = await post.comments()

      expect(comments.length).toBe(2)
    })
  })

  describe('methods', () => {
    test('generateSlug creates slug from title', async () => {
      const post = new Post({ title: 'Hello World! This is a Test' })

      const slug = post.generateSlug()

      expect(slug).toBe('hello-world-this-is-a-test')
    })

    test('publish sets published and publishedAt', async () => {
      const post = await factory.create('post', { published: false })

      await post.publish()

      expect(post.published).toBe(true)
      expect(post.publishedAt).toBeDefined()
    })
  })
})
