/**
 * NotImplementedError - what a planned API throws until it lands
 *
 * A stub that resolves `undefined` reports success while doing nothing: mail
 * is not sent, a job is not queued, a test body is not run. Every planned API
 * throws this instead, naming itself and the feature it belongs to, so a
 * caller finds out at the call. test/support/no_silent_stubs.test.js rejects
 * a function under src/ whose body is only TODO comments (or a placeholder
 * return), so a new silent stub cannot land.
 */

export class NotImplementedError extends Error {
  /**
   * @param {string} api - what was called, e.g. 'Job.performLater'
   * @param {string} feature - the README "Planned" entry it belongs to
   */
  constructor(api, feature) {
    super(`${api} is not implemented yet (planned: ${feature}; see "Planned" in the README)`)
    this.name = 'NotImplementedError'
    this.api = api
    this.feature = feature
  }
}
