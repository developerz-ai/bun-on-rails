/**
 * Mailer - Email sending system
 *
 * Mail#deliver() hands the message to the adapter mail.adapter names:
 * 'console' (the default) prints it, 'test' keeps it in mailDeliveries().
 * deliverLater() queues it through the job queue. The transports (smtp,
 * sendgrid, postmark, ses) are planned and refused at boot. Pinned by
 * test/mail/delivery.test.js.
 */

import { NotImplementedError } from '../support/not_implemented.js'
import { Job } from '../jobs/job.js'

const BUILT_ADAPTERS = ['console', 'test']
const PLANNED_ADAPTERS = ['smtp', 'sendgrid', 'postmark', 'ses']
let mailConfig = { adapter: 'console', from: null }

/**
 * Set the mail adapter and default sender (Application boot passes the mail
 * config section). An adapter that is not built throws.
 * @param {{ adapter?: string, from?: string }} config
 */
export function configureMail({ adapter = 'console', from = null } = {}) {
  if (PLANNED_ADAPTERS.includes(adapter)) {
    throw new NotImplementedError(`mail.adapter '${adapter}'`, 'mail delivery')
  }
  if (!BUILT_ADAPTERS.includes(adapter)) {
    throw new Error(`Unknown mail.adapter '${adapter}'. The built-in adapters are 'console' and 'test'.`)
  }
  mailConfig = { adapter, from }
}

/** Hand a built message to the configured adapter. */
async function deliverMessage(message) {
  await MailAdapters[mailConfig.adapter].send(message)
  return message
}

/** The messages the test adapter has kept, oldest first. */
export function mailDeliveries() {
  return [...MailAdapters.test.deliveries]
}

/** Forget the messages the test adapter has kept (between tests). */
export function clearMailDeliveries() {
  MailAdapters.test.clear()
}

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
   * Send the email now, through the configured adapter
   * @returns {Promise<Object>} the message delivered
   */
  async deliver() {
    return deliverMessage(this.message())
  }

  /**
   * Queue the email: a DeliverMailJob sends it from the job queue. The
   * message is built now, so a missing recipient fails here.
   * @returns {Promise<string>} the job id
   */
  async deliverLater() {
    return DeliverMailJob.performLater({ message: this.message() })
  }

  /**
   * The message as plain data: from (the mailer's default, else mail.from),
   * to, cc, bcc, replyTo, subject, text, html, attachments.
   * @returns {Object}
   */
  message() {
    const { template, from, to, cc, bcc, replyTo, subject, text, html, attachments } = this.options
    if (template) {
      throw new NotImplementedError('Mail#template', 'HTML views')
    }
    if (!to || (Array.isArray(to) && to.length === 0)) {
      throw new Error('Mail has no recipient: give it `to`')
    }
    const sender = from ?? mailConfig.from
    if (!sender) {
      throw new Error('Mail has no sender: give the mailer `static defaults = { from }`, or set mail.from in config')
    }
    const message = { from: sender, to, cc, bcc, replyTo, subject, text, html, attachments }
    return Object.fromEntries(Object.entries(message).filter(([, value]) => value !== undefined && value !== null))
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
      throw new NotImplementedError('MailAdapters.smtp.send', 'mail delivery')
    }
  },

  /**
   * SendGrid adapter
   */
  sendgrid: {
    async send(_mail) {
      // TODO: Send via SendGrid API
      throw new NotImplementedError('MailAdapters.sendgrid.send', 'mail delivery')
    }
  },

  /**
   * Postmark adapter
   */
  postmark: {
    async send(_mail) {
      // TODO: Send via Postmark API
      throw new NotImplementedError('MailAdapters.postmark.send', 'mail delivery')
    }
  },

  /**
   * AWS SES adapter
   */
  ses: {
    async send(_mail) {
      // TODO: Send via AWS SES
      throw new NotImplementedError('MailAdapters.ses.send', 'mail delivery')
    }
  },

  /**
   * Console adapter - prints each message (the default)
   */
  console: {
    async send(message) {
      const headers = ['From', 'To', 'Cc', 'Bcc', 'Subject'].map((name) => {
        const value = message[name.toLowerCase()]
        return value === undefined ? null : `${name}: ${[].concat(value).join(', ')}`
      })
      console.log(['--- mail ---', ...headers.filter(Boolean), '', message.text ?? message.html ?? '', '------------'].join('\n'))
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
    throw new NotImplementedError('MailRenderer#render', 'mail delivery')
  }
}

/** Sends a message queued by Mail#deliverLater(). */
export class DeliverMailJob extends Job {
  async perform({ message }) {
    return deliverMessage(message)
  }
}
