/**
 * Send Welcome Email Job
 */

import { Job } from '@bun-on-rails/framework'
import User from '../models/user.js'
import UserMailer from '../mailers/user_mailer.js'

export default class SendWelcomeEmailJob extends Job {
  static queue = 'emails'
  static attempts = 3
  static backoff = { type: 'exponential', delay: 1000 }

  async perform({ userId }) {
    const user = await User.find(userId)

    if (!user) {
      console.log(`User ${userId} not found, skipping welcome email`)
      return
    }

    await UserMailer.welcome(user).deliver()

    console.log(`Welcome email sent to ${user.email}`)
  }
}
