/**
 * Mailer - Email sending system
 */

export class Mailer {
  static defaults = {
    from: null,
    replyTo: null
  }

  /**
   * Create a mail instance
   * @param {Object} options
   * @returns {Mail}
   */
  static mail(options) {
    return new Mail({
      ...this.defaults,
      ...options
    })
  }
}

/**
 * Mail - Represents an email to be sent
 */
export class Mail {
  constructor(options) {
    this.options = options
  }

  /**
   * Send the email immediately
   */
  async deliver() {
    // TODO: Render template if specified
    // TODO: Send via configured adapter
  }

  /**
   * Queue the email for background delivery
   */
  async deliverLater() {
    // TODO: Enqueue SendEmailJob
  }

  /**
   * Set the recipient
   * @param {string|string[]} addresses
   * @returns {Mail}
   */
  to(addresses) {
    this.options.to = addresses
    return this
  }

  /**
   * Set CC recipients
   * @param {string|string[]} addresses
   * @returns {Mail}
   */
  cc(addresses) {
    this.options.cc = addresses
    return this
  }

  /**
   * Set BCC recipients
   * @param {string|string[]} addresses
   * @returns {Mail}
   */
  bcc(addresses) {
    this.options.bcc = addresses
    return this
  }

  /**
   * Set the subject
   * @param {string} subject
   * @returns {Mail}
   */
  subject(subject) {
    this.options.subject = subject
    return this
  }

  /**
   * Set plain text body
   * @param {string} text
   * @returns {Mail}
   */
  text(text) {
    this.options.text = text
    return this
  }

  /**
   * Set HTML body
   * @param {string} html
   * @returns {Mail}
   */
  html(html) {
    this.options.html = html
    return this
  }

  /**
   * Use a template
   * @param {string} name
   * @param {Object} data
   * @returns {Mail}
   */
  template(name, data = {}) {
    this.options.template = name
    this.options.data = data
    return this
  }

  /**
   * Add an attachment
   * @param {Object} attachment
   * @returns {Mail}
   */
  attach(attachment) {
    if (!this.options.attachments) {
      this.options.attachments = []
    }
    this.options.attachments.push(attachment)
    return this
  }
}

/**
 * Mail Adapters
 */
export const MailAdapters = {
  /**
   * SMTP adapter
   */
  smtp: {
    async send(_mail) {
      // TODO: Send via SMTP
    }
  },

  /**
   * SendGrid adapter
   */
  sendgrid: {
    async send(_mail) {
      // TODO: Send via SendGrid API
    }
  },

  /**
   * Postmark adapter
   */
  postmark: {
    async send(_mail) {
      // TODO: Send via Postmark API
    }
  },

  /**
   * AWS SES adapter
   */
  ses: {
    async send(_mail) {
      // TODO: Send via AWS SES
    }
  },

  /**
   * Test adapter - stores emails for inspection
   */
  test: {
    deliveries: [],
    async send(mail) {
      this.deliveries.push(mail)
    },
    clear() {
      this.deliveries = []
    }
  }
}

/**
 * Template renderer for React email components
 */
export class MailRenderer {
  constructor(templatesPath) {
    this.templatesPath = templatesPath
  }

  /**
   * Render a template to HTML
   * @param {string} name
   * @param {Object} data
   * @returns {Promise<string>}
   */
  async render(_name, _data) {
    // TODO: Load React component
    // TODO: Render to static HTML
    // TODO: Apply email layout
  }
}
