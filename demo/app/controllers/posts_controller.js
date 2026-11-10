/**
 * Posts Controller
 */

import ApplicationController from './application_controller.js'
import Post from '../models/post.js'

export default class PostsController extends ApplicationController {
  static beforeAction = {
    requireToken: { only: ['create', 'update', 'destroy'] }
  }

  /**
   * GET /posts?page=2 - published posts, newest first, 20 a page
   */
  async index() {
    const result = await Post.published()
      .recent()
      .page(Number(this.params.page) || 1)
      .per(20)
      .paginate()

    return this.render({ posts: result.records, page: result.currentPage, totalPages: result.totalPages })
  }

  /**
   * GET /posts/:id - a post and its comments
   */
  async show() {
    const post = await Post.findById(this.params.id)
    if (!post) {
      return this.notFound('Post not found')
    }

    const comments = await post.loadAssociation('comments')
    return this.render({ post, comments })
  }

  /**
   * POST /posts - { post: { title, body, slug?, published?, user_id } }
   */
  async create() {
    const post = await Post.create(this.postParams())
    if (!post.persisted) {
      return this.unprocessableEntity(post.errors)
    }

    return this.render({ post }, { status: 201 })
  }

  /**
   * PATCH /posts/:id
   */
  async update() {
    const post = await Post.findById(this.params.id)
    if (!post) {
      return this.notFound('Post not found')
    }

    if (!(await post.update(this.postParams()))) {
      return this.unprocessableEntity(post.errors)
    }

    return this.render({ post })
  }

  /**
   * DELETE /posts/:id
   */
  async destroy() {
    const post = await Post.findById(this.params.id)
    if (!post) {
      return this.notFound('Post not found')
    }

    await post.destroy()
    return this.render({ deleted: true })
  }

  postParams() {
    return this.permitted('post', 'title', 'body', 'slug', 'published', 'user_id')
  }
}
