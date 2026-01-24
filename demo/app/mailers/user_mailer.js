/**
 * User Mailer
 */

import { Mailer } from '@bun-on-rails/framework'

export default class UserMailer extends Mailer {
  static defaults = {
    from: 'noreply@example.com'
  }

  welcome(user) {
    return this.constructor.mail({
      to: user.email,
      subject: 'Welcome to Our App!',
      template: 'welcome',
      data: { user }
    })
  }

  passwordReset(user, token) {
    return this.constructor.mail({
      to: user.email,
      subject: 'Reset Your Password',
      template: 'password_reset',
      data: { user, token, resetUrl: `https://example.com/reset?token=${token}` }
    })
  }

  emailConfirmation(user, token) {
    return this.constructor.mail({
      to: user.email,
      subject: 'Confirm Your Email',
      template: 'email_confirmation',
      data: { user, token }
    })
  }
}
