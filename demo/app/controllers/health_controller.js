/**
 * Health Controller - GET /health
 */

import ApplicationController from './application_controller.js'

export default class HealthController extends ApplicationController {
  index() {
    return this.render({ status: 'ok' })
  }
}
