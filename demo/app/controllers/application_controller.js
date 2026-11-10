/**
 * Application Controller - what every demo controller shares
 */

import { Controller, StrongParams } from '../../../src/index.js'

export default class ApplicationController extends Controller {
  /**
   * Writes need `Authorization: Bearer <DEMO_API_TOKEN>`. Authentication with
   * users and sessions is planned; until it lands, one token from the
   * environment guards the API. With DEMO_API_TOKEN unset, every write is 401.
   */
  requireToken() {
    const token = process.env.DEMO_API_TOKEN
    if (!token || this.request.headers.get('authorization') !== `Bearer ${token}`) {
      return this.render({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  /**
   * The permitted fields of `this.params[key]`; anything else is dropped.
   * @param {string} key - e.g. 'post'
   * @param {...string} fields
   * @returns {Object}
   */
  permitted(key, ...fields) {
    return new StrongParams(this.params[key] ?? {}).permit(...fields).toObject()
  }
}
