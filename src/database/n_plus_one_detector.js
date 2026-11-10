/**
 * N+1 Query Detection - Development mode warning system
 *
 * Detects N+1 query patterns in development mode and emits console warnings
 * to help developers identify and fix inefficient database access patterns.
 *
 * The detector tracks query patterns and identifies when similar queries
 * are being executed multiple times in a short timeframe, which typically
 * indicates an N+1 query problem that should be solved with eager loading.
 *
 * @module bun-on-rails/database/n_plus_one_detector
 */

import { isDevelopment } from '../config/loader.js'

/**
 * Query fingerprint for pattern detection
 * @typedef {Object} QueryFingerprint
 * @property {string} pattern - Normalized query pattern (without specific values)
 * @property {string} table - Table being queried
 * @property {string} type - Query type (SELECT, INSERT, etc.)
 * @property {string[]} columns - Columns in WHERE clause
 */

/**
 * Query entry for tracking
 * @typedef {Object} QueryEntry
 * @property {string} sql - Original SQL query
 * @property {QueryFingerprint} fingerprint - Query fingerprint
 * @property {number} timestamp - Query timestamp
 * @property {string[]} stackTrace - Call stack frames
 */

/**
 * Configuration options for N+1 detection
 * @typedef {Object} N1DetectorConfig
 * @property {boolean} enabled - Whether detection is enabled
 * @property {number} threshold - Number of similar queries before warning (default: 3)
 * @property {number} windowMs - Time window for grouping queries in ms (default: 1000)
 * @property {boolean} includeStackTrace - Include stack trace in warnings
 * @property {string[]} ignoredTables - Tables to ignore (e.g., sessions, logs)
 * @property {Function|null} onDetection - Custom callback for detections
 */

/**
 * Default configuration
 * @type {N1DetectorConfig}
 */
const DEFAULT_CONFIG = {
  enabled: true,
  threshold: 3,
  windowMs: 1000,
  includeStackTrace: true,
  ignoredTables: ['sessions', 'schema_migrations', 'ar_internal_metadata'],
  onDetection: null,
  // When true, bypasses isDevelopment() check (for testing)
  forceEnabled: false
}

/**
 * N+1 Query Detector
 *
 * Tracks database queries and detects patterns that indicate N+1 problems.
 * Only active in development mode by default.
 *
 * @example
 * // Basic usage - automatically integrated with QueryBuilder
 * const posts = await Post.all()  // 1 query
 * for (const post of posts) {
 *   await post.author()  // N queries - triggers warning!
 * }
 *
 * // Fix with eager loading:
 * const posts = await Post.includes('author').all()  // 2 queries total
 *
 * @example
 * // Manual configuration
 * N1Detector.configure({
 *   threshold: 5,       // Warn after 5 similar queries
 *   windowMs: 2000,     // Within 2 second window
 *   ignoredTables: ['logs', 'metrics']
 * })
 */
class N1Detector {
  constructor() {
    /** @type {N1DetectorConfig} */
    this.config = { ...DEFAULT_CONFIG }

    /** @type {QueryEntry[]} */
    this.queries = []

    /** @type {Map<string, number[]>} Map of fingerprint -> timestamps */
    this.patternCounts = new Map()

    /** @type {Set<string>} Patterns we've already warned about */
    this.warnedPatterns = new Set()

    /** @type {number} Last cleanup timestamp */
    this.lastCleanup = Date.now()
  }

  /**
   * Configure the detector
   *
   * @param {Partial<N1DetectorConfig>} options - Configuration options
   *
   * @example
   * N1Detector.configure({
   *   threshold: 5,
   *   ignoredTables: ['logs', 'sessions']
   * })
   */
  configure(options) {
    this.config = { ...this.config, ...options }
  }

  /**
   * Enable the detector
   */
  enable() {
    this.config.enabled = true
  }

  /**
   * Disable the detector
   */
  disable() {
    this.config.enabled = false
  }

  /**
   * Check if detector is active (enabled and in development mode)
   * @returns {boolean}
   */
  isActive() {
    if (this.config.forceEnabled) {
      return this.config.enabled
    }
    return this.config.enabled && isDevelopment()
  }

  /**
   * Track a query for N+1 detection
   *
   * @param {string} sql - The SQL query string
   * @param {any[]} params - Query parameters
   * @param {Object} [context] - Additional context
   * @param {string} [context.model] - Model class name
   * @param {string} [context.association] - Association name if applicable
   */
  track(sql, params = [], context = {}) {
    if (!this.isActive()) {
      return
    }

    // Periodically clean up old entries
    this._cleanup()

    // Generate fingerprint
    const fingerprint = this._generateFingerprint(sql, params)

    // Check if this table should be ignored
    if (this.config.ignoredTables.includes(fingerprint.table)) {
      return
    }

    const now = Date.now()
    const fingerprintKey = this._fingerprintKey(fingerprint)

    // Track the query
    const entry = {
      sql,
      fingerprint,
      timestamp: now,
      stackTrace: this.config.includeStackTrace ? this._captureStackTrace() : [],
      context
    }

    this.queries.push(entry)

    // Track pattern occurrences
    if (!this.patternCounts.has(fingerprintKey)) {
      this.patternCounts.set(fingerprintKey, [])
    }
    this.patternCounts.get(fingerprintKey).push(now)

    // Check for N+1 pattern
    this._checkForN1Pattern(fingerprintKey, fingerprint, entry)
  }

  /**
   * Generate a fingerprint for a query that ignores specific values
   *
   * @param {string} sql - SQL query
   * @param {any[]} params - Query parameters
   * @returns {QueryFingerprint}
   * @private
   */
  _generateFingerprint(sql, _params) {
    // Normalize the query
    const normalizedSql = sql
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim()
      .toLowerCase()

    // Extract query type
    const typeMatch = normalizedSql.match(/^(select|insert|update|delete)/)
    const type = typeMatch ? typeMatch[1].toUpperCase() : 'UNKNOWN'

    // Extract table name - handle both quoted and unquoted
    let table = 'unknown'

    if (type === 'SELECT') {
      // Match: FROM "table_name" or FROM table_name
      const fromMatch = normalizedSql.match(/from\s+"?([a-z_][a-z0-9_]*)"?/i)
      if (fromMatch) {
        table = fromMatch[1]
      }
    } else if (type === 'INSERT') {
      const intoMatch = normalizedSql.match(/into\s+"?([a-z_][a-z0-9_]*)"?/i)
      if (intoMatch) {
        table = intoMatch[1]
      }
    } else if (type === 'UPDATE' || type === 'DELETE') {
      const tableMatch = normalizedSql.match(/(update|delete\s+from)\s+"?([a-z_][a-z0-9_]*)"?/i)
      if (tableMatch) {
        table = tableMatch[2]
      }
    }

    // Extract WHERE clause columns
    const columns = []
    const whereMatch = normalizedSql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+offset|$)/i)
    if (whereMatch) {
      // Extract column names from conditions
      const whereClause = whereMatch[1]
      const colMatches = whereClause.matchAll(/"?([a-z_][a-z0-9_]*)"?\s*(?:=|>|<|>=|<=|<>|!=|in|is|like)/gi)
      for (const match of colMatches) {
        if (!['and', 'or', 'not'].includes(match[1].toLowerCase())) {
          columns.push(match[1])
        }
      }
    }

    // Create a pattern that ignores specific parameter values
    // Replace $1, $2, etc. with $? for pattern matching
    const pattern = normalizedSql.replace(/\$\d+/g, '$?')

    return {
      pattern,
      table,
      type,
      columns: [...new Set(columns)]  // Unique columns
    }
  }

  /**
   * Generate a unique key for a fingerprint
   *
   * @param {QueryFingerprint} fingerprint
   * @returns {string}
   * @private
   */
  _fingerprintKey(fingerprint) {
    return `${fingerprint.type}:${fingerprint.table}:${fingerprint.columns.sort().join(',')}`
  }

  /**
   * Check if the pattern count exceeds threshold and emit warning
   *
   * @param {string} fingerprintKey
   * @param {QueryFingerprint} fingerprint
   * @param {QueryEntry} latestEntry
   * @private
   */
  _checkForN1Pattern(fingerprintKey, fingerprint, latestEntry) {
    const timestamps = this.patternCounts.get(fingerprintKey) || []
    const now = Date.now()
    const windowStart = now - this.config.windowMs

    // Count queries within the time window
    const recentCount = timestamps.filter(t => t >= windowStart).length

    // Check if we've exceeded threshold and haven't warned yet
    if (recentCount >= this.config.threshold && !this.warnedPatterns.has(fingerprintKey)) {
      this.warnedPatterns.add(fingerprintKey)
      this._emitWarning(fingerprint, recentCount, latestEntry)
    }
  }

  /**
   * Emit N+1 warning to console
   *
   * @param {QueryFingerprint} fingerprint
   * @param {number} count
   * @param {QueryEntry} latestEntry
   * @private
   */
  _emitWarning(fingerprint, count, latestEntry) {
    const warning = this._formatWarning(fingerprint, count, latestEntry)

    // Use custom callback if provided
    if (typeof this.config.onDetection === 'function') {
      this.config.onDetection({
        fingerprint,
        count,
        warning,
        sql: latestEntry.sql,
        stackTrace: latestEntry.stackTrace
      })
      return
    }

    // Default: console warning with styling
    console.warn('\n' + '='.repeat(70))
    console.warn('\x1b[33m\x1b[1m⚠️  N+1 QUERY DETECTED\x1b[0m')
    console.warn('='.repeat(70))
    console.warn(warning)
    console.warn('='.repeat(70) + '\n')
  }

  /**
   * Format warning message
   *
   * @param {QueryFingerprint} fingerprint
   * @param {number} count
   * @param {QueryEntry} latestEntry
   * @returns {string}
   * @private
   */
  _formatWarning(fingerprint, count, latestEntry) {
    const lines = [
      '',
      `\x1b[1mTable:\x1b[0m ${fingerprint.table}`,
      `\x1b[1mQuery Type:\x1b[0m ${fingerprint.type}`,
      `\x1b[1mOccurrences:\x1b[0m ${count} similar queries within ${this.config.windowMs}ms`,
      '',
      '\x1b[1mExample Query:\x1b[0m',
      `  ${latestEntry.sql.substring(0, 200)}${latestEntry.sql.length > 200 ? '...' : ''}`,
      ''
    ]

    // Add suggestion based on the query pattern
    lines.push('\x1b[1m\x1b[36mSuggestion:\x1b[0m')

    if (fingerprint.columns.includes(`${this._singularize(fingerprint.table)}_id`) ||
        fingerprint.columns.some(c => c.endsWith('_id'))) {
      // Likely an association query
      const parentCol = fingerprint.columns.find(c => c.endsWith('_id'))
      const _parentModel = parentCol ? this._classify(parentCol.replace('_id', '')) : 'Parent'

      lines.push(`  This looks like an association query. Consider using eager loading:`)
      lines.push('')
      lines.push(`  \x1b[32m// Instead of:`)
      lines.push(`  const records = await Model.all()`)
      lines.push(`  for (const record of records) {`)
      lines.push(`    await record.${this._singularize(fingerprint.table)}()  // N+1!`)
      lines.push(`  }`)
      lines.push('')
      lines.push(`  // Use:`)
      lines.push(`  const records = await Model.includes('${this._singularize(fingerprint.table)}').all()\x1b[0m`)
    } else if (fingerprint.columns.includes('id')) {
      // Likely loading by ID in a loop
      lines.push(`  This looks like loading records by ID in a loop.`)
      lines.push(`  Consider using \x1b[32m${this._classify(fingerprint.table)}.where({ id: ids })\x1b[0m`)
      lines.push(`  to load all records in a single query.`)
    } else {
      lines.push(`  Consider using eager loading with \x1b[32mincludes()\x1b[0m`)
      lines.push(`  or batching these queries with \x1b[32mwhere({ col: values })\x1b[0m`)
    }

    // Add stack trace if available
    if (latestEntry.stackTrace && latestEntry.stackTrace.length > 0) {
      lines.push('')
      lines.push('\x1b[1mStack Trace:\x1b[0m')
      latestEntry.stackTrace.slice(0, 5).forEach(frame => {
        lines.push(`  ${frame}`)
      })
      if (latestEntry.stackTrace.length > 5) {
        lines.push(`  ... and ${latestEntry.stackTrace.length - 5} more`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Capture current stack trace, filtering out internal frames
   *
   * @returns {string[]}
   * @private
   */
  _captureStackTrace() {
    const stack = new Error().stack || ''
    const frames = stack.split('\n').slice(2)  // Skip Error and this method

    // Filter out internal framework frames
    const filtered = frames.filter(frame => {
      const lowerFrame = frame.toLowerCase()
      return !lowerFrame.includes('n_plus_one_detector') &&
             !lowerFrame.includes('query_builder') &&
             !lowerFrame.includes('connection.js') &&
             !lowerFrame.includes('node_modules') &&
             !lowerFrame.includes('bun:')
    })

    return filtered.map(f => f.trim()).slice(0, 10)
  }

  /**
   * Clean up old query entries
   * @private
   */
  _cleanup() {
    const now = Date.now()

    // Only cleanup every 5 seconds
    if (now - this.lastCleanup < 5000) {
      return
    }

    this.lastCleanup = now
    const cutoff = now - this.config.windowMs * 2

    // Clean up old queries
    this.queries = this.queries.filter(q => q.timestamp >= cutoff)

    // Clean up old pattern counts
    for (const [key, timestamps] of this.patternCounts.entries()) {
      const filtered = timestamps.filter(t => t >= cutoff)
      if (filtered.length === 0) {
        this.patternCounts.delete(key)
        this.warnedPatterns.delete(key)  // Allow re-warning after cooldown
      } else {
        this.patternCounts.set(key, filtered)
      }
    }
  }

  /**
   * Reset all tracking state
   * Useful for tests or starting fresh
   */
  reset() {
    this.queries = []
    this.patternCounts.clear()
    this.warnedPatterns.clear()
    this.lastCleanup = Date.now()
    // Reset config to defaults
    this.config = { ...DEFAULT_CONFIG }
  }

  /**
   * Get statistics about tracked queries
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalTracked: this.queries.length,
      patterns: {},
      potentialN1: []
    }

    for (const [key, timestamps] of this.patternCounts.entries()) {
      if (timestamps.length >= this.config.threshold) {
        stats.potentialN1.push({
          pattern: key,
          count: timestamps.length
        })
      }
      stats.patterns[key] = timestamps.length
    }

    return stats
  }

  /**
   * Simple singularize helper
   * @param {string} str
   * @returns {string}
   * @private
   */
  _singularize(str) {
    if (str.endsWith('ies')) return str.slice(0, -3) + 'y'
    if (str.endsWith('es')) return str.slice(0, -2)
    if (str.endsWith('s')) return str.slice(0, -1)
    return str
  }

  /**
   * Convert to class name
   * @param {string} str
   * @returns {string}
   * @private
   */
  _classify(str) {
    return str
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  }
}

// Singleton instance
const detector = new N1Detector()

/**
 * Export singleton instance for direct access
 */
export const N1QueryDetector = detector

/**
 * Track a query for N+1 detection
 *
 * @param {string} sql - SQL query
 * @param {any[]} params - Query parameters
 * @param {Object} context - Additional context
 */
export function trackQuery(sql, params = [], context = {}) {
  detector.track(sql, params, context)
}

/**
 * Configure the N+1 detector
 *
 * @param {Partial<N1DetectorConfig>} options
 */
export function configureN1Detection(options) {
  detector.configure(options)
}

/**
 * Enable N+1 detection
 */
export function enableN1Detection() {
  detector.enable()
}

/**
 * Disable N+1 detection
 */
export function disableN1Detection() {
  detector.disable()
}

/**
 * Reset N+1 detection state
 */
export function resetN1Detection() {
  detector.reset()
}

/**
 * Get N+1 detection statistics
 * @returns {Object}
 */
export function getN1Stats() {
  return detector.getStats()
}

export default N1QueryDetector
