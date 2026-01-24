/**
 * Sessions Controller - Authentication
 */

import { Controller } from '@bun-on-rails/framework'
import User from '../models/user.js'

export default class SessionsController extends Controller {
  /**
   * GET /login
   */
  async new() {
    if (this.currentUser) {
      return this.redirect('/')
    }
    return this.render({})
  }

  /**
   * POST /login
   */
  async create() {
    const { email, password } = this.params

    const user = await User.findBy({ email })

    if (!user || !(await user.authenticate(password))) {
      return this.render(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Create session
    this.session.userId = user.id

    return this.render({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })
  }

  /**
   * DELETE /logout
   */
  async destroy() {
    this.session.userId = null

    return this.render({ success: true })
  }
}
