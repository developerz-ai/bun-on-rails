/**
 * The demo's JSON API, through request(app): posts and their comments.
 * Writes need `Authorization: Bearer <DEMO_API_TOKEN>`. Runs on PostgreSQL
 * when TEST_DATABASE_URL is set (see test/support/database.js).
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test'
import { Application, request, factory, cleanDatabase } from '../../../src/index.js'
import { serverUrl, root, useTestDatabase, dropTestDatabase } from '../support/database.js'
import '../factories/index.js'

const token = { authorization: 'Bearer demo-test-token' }
let app

describe.skipIf(!serverUrl)('demo API', () => {
  beforeAll(async () => {
    process.env.DEMO_API_TOKEN = 'demo-test-token'
    await useTestDatabase()
    app = new Application({ root, config: { logging: { level: 'error' } } })
    await app.initialize()
  })

  afterAll(async () => {
    await app?.stop()
    await dropTestDatabase()
  })

  beforeEach(() => cleanDatabase())

  test('GET /health', async () => {
    const res = await request(app).get('/health')
    await res.assertJson({ status: 'ok' })
  })

  describe('posts', () => {
    test('GET /posts lists published posts, newest first, a page at a time', async () => {
      await factory.create('post', { title: 'Draft', published: false })
      const older = await factory.create('post', { title: 'Older', published: true })
      await Bun.sleep(5)
      const newer = await factory.create('post', { title: 'Newer', published: true })

      const res = await request(app).get('/posts', { page: 1 })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.posts.map((p) => p.id)).toEqual([newer.id, older.id])
      expect(body.page).toBe(1)
      expect(body.totalPages).toBe(1)
    })

    test('GET /posts/:id gives the post and its comments; an unknown id is 404', async () => {
      const post = await factory.create('post', { title: 'With comments' })
      await factory.create('comment', { post_id: post.id, body: 'First' })

      const res = await request(app).get(`/posts/${post.id}`)
      const body = await res.json()
      expect(body.post.title).toBe('With comments')
      expect(body.comments.map((c) => c.body)).toEqual(['First'])

      expect((await request(app).get('/posts/999999')).status).toBe(404)
    })

    test('POST /posts needs the token, then creates or answers 422', async () => {
      const user = await factory.create('user')
      const post = { title: 'Hello there', body: 'Text', user_id: user.id }

      expect((await request(app).post('/posts', { post })).status).toBe(401)

      const created = await request(app).header('authorization', token.authorization).post('/posts', { post })
      expect(created.status).toBe(201)
      expect((await created.json()).post.slug).toBe('hello-there')

      const invalid = await request(app).header('authorization', token.authorization).post('/posts', { post: { body: 'x' } })
      expect(invalid.status).toBe(422)
      expect((await invalid.json()).errors.title).toBe("title can't be blank")
    })

    test('a field the controller does not permit is ignored', async () => {
      const user = await factory.create('user')
      const res = await request(app)
        .header('authorization', token.authorization)
        .post('/posts', { post: { title: 'Permitted', body: 'Text', user_id: user.id, id: 424242 } })

      expect((await res.json()).post.id).not.toBe('424242')
    })

    test('PATCH and DELETE /posts/:id need the token', async () => {
      const post = await factory.create('post', { title: 'Before' })

      expect((await request(app).patch(`/posts/${post.id}`, { post: { title: 'After' } })).status).toBe(401)

      const updated = await request(app).header('authorization', token.authorization).patch(`/posts/${post.id}`, { post: { title: 'After' } })
      expect((await updated.json()).post.title).toBe('After')

      const deleted = await request(app).header('authorization', token.authorization).delete(`/posts/${post.id}`)
      expect(deleted.status).toBe(200)
      expect((await request(app).get(`/posts/${post.id}`)).status).toBe(404)
    })
  })

  describe('comments', () => {
    test('GET and POST /posts/:post_id/comments', async () => {
      const post = await factory.create('post')
      const user = await factory.create('user')

      const created = await request(app)
        .header('authorization', token.authorization)
        .post(`/posts/${post.id}/comments`, { comment: { body: 'Nice', user_id: user.id } })
      expect(created.status).toBe(201)

      const res = await request(app).get(`/posts/${post.id}/comments`)
      expect((await res.json()).comments.map((c) => c.body)).toEqual(['Nice'])
    })
  })
})
