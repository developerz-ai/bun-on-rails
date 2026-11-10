/**
 * Comments Controller - nested under a post: /posts/:post_id/comments
 */

import ApplicationController from './application_controller.js'
import Comment from '../models/comment.js'

export default class CommentsController extends ApplicationController {
  static beforeAction = {
    requireToken: { only: ['create'] }
  }

  /**
   * GET /posts/:post_id/comments - newest first
   */
  async index() {
    const comments = await Comment.where({ post_id: this.params.post_id }).scope('recent').all()
    return this.render({ comments })
  }

  /**
   * POST /posts/:post_id/comments - { comment: { body, user_id } }
   */
  async create() {
    const comment = await Comment.create({
      ...this.permitted('comment', 'body', 'user_id'),
      post_id: this.params.post_id
    })
    if (!comment.persisted) {
      return this.unprocessableEntity(comment.errors)
    }

    return this.render({ comment }, { status: 201 })
  }
}
