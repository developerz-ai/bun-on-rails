/**
 * Posts Controller
 */

import { Controller } from '../../../src/index.js'
import Post from '../models/post.js'

export default class PostsController extends Controller {
  static beforeAction = {
    authenticate: { except: ['index', 'show'] }
  }

  /**
   * GET /posts
   */
  async index() {
    const posts = await Post
      .published()
      .recent()
      .includes('user')
      .page(this.params.page || 1)
      .per(20)

    return this.render({ posts })
  }

  /**
   * GET /posts/:id
   */
  async show() {
    const post = await Post.find(this.params.id)

    if (!post) {
      return this.notFound('Post not found')
    }

    // Eager load comments with authors
    const comments = await post.comments({ include: 'user' })

    return this.render({ post, comments })
  }

  /**
   * GET /posts/new
   */
  async new() {
    const post = new Post()
    return this.render({ post })
  }

  /**
   * POST /posts
   */
  async create() {
    const post = await Post.create({
      ...this.params.post,
      userId: this.currentUser.id
    })

    if (post.errors && Object.keys(post.errors).length > 0) {
      return this.unprocessableEntity(post.errors)
    }

    // Broadcast to subscribers
    this.broadcast('posts:new', { post })

    return this.render({ post }, { status: 201 })
  }

  /**
   * GET /posts/:id/edit
   */
  async edit() {
    const post = await this.findPostForUser()

    if (!post) {
      return this.notFound('Post not found')
    }

    return this.render({ post })
  }

  /**
   * PATCH /posts/:id
   */
  async update() {
    const post = await this.findPostForUser()

    if (!post) {
      return this.notFound('Post not found')
    }

    const success = await post.update(this.params.post)

    if (!success) {
      return this.unprocessableEntity(post.errors)
    }

    return this.render({ post })
  }

  /**
   * DELETE /posts/:id
   */
  async destroy() {
    const post = await this.findPostForUser()

    if (!post) {
      return this.notFound('Post not found')
    }

    await post.destroy()

    return this.render({ success: true })
  }

  // Private methods
  async findPostForUser() {
    const post = await Post.find(this.params.id)

    if (!post) return null

    // Users can only edit their own posts (admins can edit any)
    if (post.userId !== this.currentUser.id && !this.currentUser.isAdmin) {
      return null
    }

    return post
  }
}
