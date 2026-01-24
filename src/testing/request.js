/**
 * Test Request - HTTP request testing utilities
 */

export class TestRequest {
  constructor(app) {
    this.app = app
    this.headers = {}
    this.cookies = {}
  }

  /**
   * Set request header
   * @param {string} name
   * @param {string} value
   * @returns {TestRequest}
   */
  header(name, value) {
    this.headers[name] = value
    return this
  }

  /**
   * Set authentication
   * @param {Object} user
   * @returns {TestRequest}
   */
  as(user) {
    // TODO: Set auth headers/cookies
    return this
  }

  /**
   * Make GET request
   * @param {string} path
   * @param {Object} params
   * @returns {Promise<TestResponse>}
   */
  async get(path, params = {}) {
    return this.request('GET', path, { params })
  }

  /**
   * Make POST request
   * @param {string} path
   * @param {Object} body
   * @returns {Promise<TestResponse>}
   */
  async post(path, body = {}) {
    return this.request('POST', path, { body })
  }

  /**
   * Make PUT request
   * @param {string} path
   * @param {Object} body
   * @returns {Promise<TestResponse>}
   */
  async put(path, body = {}) {
    return this.request('PUT', path, { body })
  }

  /**
   * Make PATCH request
   * @param {string} path
   * @param {Object} body
   * @returns {Promise<TestResponse>}
   */
  async patch(path, body = {}) {
    return this.request('PATCH', path, { body })
  }

  /**
   * Make DELETE request
   * @param {string} path
   * @returns {Promise<TestResponse>}
   */
  async delete(path) {
    return this.request('DELETE', path)
  }

  /**
   * Make a request
   * @param {string} method
   * @param {string} path
   * @param {Object} options
   * @returns {Promise<TestResponse>}
   */
  async request(method, path, options = {}) {
    // TODO: Build Request object
    // TODO: Send to app.handle()
    // TODO: Return TestResponse
  }
}

/**
 * Test Response - Response wrapper with assertions
 */
export class TestResponse {
  constructor(response) {
    this.response = response
    this.status = response.status
    this.headers = response.headers
    this._json = null
    this._text = null
  }

  /**
   * Get response body as JSON
   * @returns {Promise<Object>}
   */
  async json() {
    if (this._json === null) {
      this._json = await this.response.json()
    }
    return this._json
  }

  /**
   * Get response body as text
   * @returns {Promise<string>}
   */
  async text() {
    if (this._text === null) {
      this._text = await this.response.text()
    }
    return this._text
  }

  /**
   * Assert status code
   * @param {number} expected
   * @returns {TestResponse}
   */
  assertStatus(expected) {
    if (this.status !== expected) {
      throw new Error(`Expected status ${expected}, got ${this.status}`)
    }
    return this
  }

  /**
   * Assert successful response (2xx)
   * @returns {TestResponse}
   */
  assertOk() {
    if (this.status < 200 || this.status >= 300) {
      throw new Error(`Expected 2xx status, got ${this.status}`)
    }
    return this
  }

  /**
   * Assert created (201)
   * @returns {TestResponse}
   */
  assertCreated() {
    return this.assertStatus(201)
  }

  /**
   * Assert no content (204)
   * @returns {TestResponse}
   */
  assertNoContent() {
    return this.assertStatus(204)
  }

  /**
   * Assert redirect
   * @param {string} location
   * @returns {TestResponse}
   */
  assertRedirect(location = null) {
    if (this.status < 300 || this.status >= 400) {
      throw new Error(`Expected redirect status, got ${this.status}`)
    }
    if (location && this.headers.get('Location') !== location) {
      throw new Error(`Expected redirect to ${location}`)
    }
    return this
  }

  /**
   * Assert JSON structure
   * @param {Object} expected
   * @returns {Promise<TestResponse>}
   */
  async assertJson(expected) {
    const json = await this.json()
    // TODO: Deep compare
    return this
  }

  /**
   * Assert JSON has key
   * @param {string} key
   * @returns {Promise<TestResponse>}
   */
  async assertJsonHas(key) {
    const json = await this.json()
    // TODO: Check nested keys
    return this
  }
}

// Create default request instance
export const request = new TestRequest(null)
