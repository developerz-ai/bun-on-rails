/**
 * Post Model Tests
 *
 * Run against PostgreSQL when TEST_DATABASE_URL names a server (CI's demo job
 * sets it; bin/check skips them without it). They create a database of their
 * own there, point config/database.js's DATABASE_URL at it, and drop it
 * afterwards, so they never migrate into or empty a database you use.
 * setupDatabase() runs the migrations; cleanDatabase() empties the tables
 * before each test.
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test'
import { join } from 'path'
import { factory, setupDatabase, cleanDatabase, getConnection, setConnection } from '../../../src/index.js'
import { createDatabase, dropDatabase } from '../../../src/cli/commands/db.js'
import '../factories/index.js'
import Post from '../../app/models/post.js'

const serverUrl = process.env.TEST_DATABASE_URL
const root = join(import.meta.dir, '..', '..')

describe.skipIf(!serverUrl)('Post', () => {
  beforeAll(async () => {
    const url = new URL(serverUrl)
    url.pathname = `/demo_test_${process.pid}_${Date.now()}`
    process.env.DATABASE_URL = url.toString()
    await createDatabase(root)
    await setupDatabase({ root })
  })

  afterAll(async () => {
    await getConnection()?.disconnect()
    setConnection(null)
    await dropDatabase(root)
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  describe('validations', () => {
    test('requires a title', async () => {
      const post = await Post.create({ body: 'content' })

      expect(post.persisted).toBe(false)
      expect(post.errors.title).toBe("title can't be blank")
    })

    test('requires a body', async () => {
      const post = await Post.create({ title: 'Test' })

      expect(post.persisted).toBe(false)
      expect(post.errors.body).toBe("body can't be blank")
    })

    test('requires unique slug', async () => {
      const user = await factory.create('user')

      await Post.create({ title: 'Test Post', body: 'Content', slug: 'test-post', user_id: user.id })
      const duplicate = await Post.create({
        title: 'Another Post',
        body: 'Content',
        slug: 'test-post',
        user_id: user.id
      })

      expect(duplicate.persisted).toBe(false)
      expect(duplicate.errors.slug).toContain('has already been taken')
    })

    test('a missing slug is generated from the title', async () => {
      const user = await factory.create('user')
      const post = await Post.create({ title: 'Hello World', body: 'Content', user_id: user.id })

      expect(post.persisted).toBe(true)
      expect(post.get('slug')).toBe('hello-world')
    })
  })

  describe('scopes', () => {
    test('published scope returns only published posts', async () => {
      const user = await factory.create('user')

      await factory.create('post', { user_id: user.id, published: true })
      await factory.create('post', { user_id: user.id, published: true })
      await factory.create('post', { user_id: user.id, published: false })

      const posts = await Post.published().all()

      expect(posts.length).toBe(2)
      expect(posts.every((p) => p.get('published'))).toBe(true)
    })

    test('recent scope orders by created_at desc', async () => {
      const user = await factory.create('user')

      const older = await factory.create('post', { user_id: user.id })
      await Bun.sleep(5)
      const newer = await factory.create('post', { user_id: user.id })

      const posts = await Post.recent().all()

      expect(posts.map((p) => p.id)).toEqual([newer.id, older.id])
    })
  })

  describe('associations', () => {
    test('belongs to user', async () => {
      const user = await factory.create('user')
      const post = await factory.create('post', { user_id: user.id })

      const author = await post.loadAssociation('user')

      expect(author.id).toBe(user.id)
    })

    test('has many comments', async () => {
      const post = await factory.create('post')
      await factory.create('comment', { post_id: post.id })
      await factory.create('comment', { post_id: post.id })

      const comments = await post.loadAssociation('comments')

      expect(comments.length).toBe(2)
    })
  })

  describe('methods', () => {
    test('generateSlug creates slug from title', () => {
      const post = new Post({ title: 'Hello World! This is a Test' })

      expect(post.generateSlug()).toBe('hello-world-this-is-a-test')
    })

    test('publish sets published and published_at, and saves them', async () => {
      const post = await factory.create('post', { published: false })

      await post.publish()

      const reloaded = await Post.find(post.id)
      expect(reloaded.get('published')).toBe(true)
      expect(reloaded.get('published_at')).toBeInstanceOf(Date)
    })
  })
})
