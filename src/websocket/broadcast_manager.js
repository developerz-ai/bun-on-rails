/**
 * BroadcastManager - Manages WebSocket broadcasting across server instances
 *
 * Supports:
 * - In-memory broadcasting for single-server deployments
 * - Redis pub/sub for multi-server deployments (horizontal scaling)
 * - Channel-based subscriptions
 *
 * @module bun-on-rails/websocket/broadcast_manager
 */

/**
 * BroadcastManager class
 *
 * Handles message broadcasting to WebSocket clients via channels.
 * Uses Redis pub/sub when available for multi-server support,
 * falls back to in-memory for single-server deployments.
 *
 * @example
 * const manager = new BroadcastManager()
 * await manager.initialize({ redis })
 *
 * // Broadcast to all subscribers of 'posts:new'
 * await manager.broadcast('posts:new', { post: { id: 1, title: 'Hello' } })
 */
export class BroadcastManager {
  constructor() {
    this.redis = null
    this.subscriber = null
    this.connections = new Map() // connectionId -> { ws, streams: Set<string> }
    this.streams = new Map() // streamName -> Set<connectionId>
    this.initialized = false
    this.logger = console
  }

  /**
   * Initialize the broadcast manager
   *
   * @param {Object} options - Configuration options
   * @param {Object} [options.redis] - Redis client for pub/sub
   * @param {Object} [options.logger] - Logger instance
   * @returns {Promise<BroadcastManager>} This instance
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return this
    }

    this.logger = options.logger || console

    if (options.redis) {
      await this._initializeRedis(options.redis)
    }

    this.initialized = true
    return this
  }

  /**
   * Initialize Redis pub/sub
   *
   * @param {Object} redis - Redis client
   * @private
   */
  async _initializeRedis(redis) {
    this.redis = redis

    // Create a separate subscriber connection
    // ioredis requires a duplicate connection for subscriptions
    try {
      this.subscriber = redis.duplicate()

      // Handle messages from Redis
      this.subscriber.on('message', (channel, message) => {
        this._handleRedisMessage(channel, message)
      })

      this.logger.debug?.('BroadcastManager: Redis pub/sub initialized')
    } catch (error) {
      this.logger.warn?.(`BroadcastManager: Redis pub/sub failed: ${error.message}`)
      this.redis = null
      this.subscriber = null
    }
  }

  /**
   * Handle message received from Redis pub/sub
   *
   * @param {string} channel - Redis channel name
   * @param {string} message - JSON message
   * @private
   */
  _handleRedisMessage(channel, message) {
    try {
      const data = JSON.parse(message)
      this._broadcastToLocalSubscribers(channel, data)
    } catch (error) {
      this.logger.error?.(`BroadcastManager: Failed to parse Redis message: ${error.message}`)
    }
  }

  /**
   * Register a WebSocket connection
   *
   * @param {string} connectionId - Unique connection identifier
   * @param {WebSocket} ws - WebSocket instance
   * @returns {void}
   */
  addConnection(connectionId, ws) {
    this.connections.set(connectionId, { ws, streams: new Set() })
  }

  /**
   * Remove a WebSocket connection
   *
   * @param {string} connectionId - Connection identifier to remove
   * @returns {void}
   */
  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId)

    if (connection) {
      // Unsubscribe from all streams
      for (const streamName of connection.streams) {
        this._removeFromStream(connectionId, streamName)
      }
      this.connections.delete(connectionId)
    }
  }

  /**
   * Subscribe a connection to a stream
   *
   * @param {string} connectionId - Connection identifier
   * @param {string} streamName - Stream/channel name to subscribe to
   * @returns {Promise<void>}
   */
  async subscribe(connectionId, streamName) {
    const connection = this.connections.get(connectionId)

    if (!connection) {
      return
    }

    // Add to local tracking
    connection.streams.add(streamName)

    if (!this.streams.has(streamName)) {
      this.streams.set(streamName, new Set())

      // Subscribe to Redis channel if this is the first local subscriber
      if (this.subscriber) {
        try {
          await this.subscriber.subscribe(streamName)
        } catch (error) {
          this.logger.error?.(`BroadcastManager: Failed to subscribe to Redis channel ${streamName}: ${error.message}`)
        }
      }
    }

    this.streams.get(streamName).add(connectionId)
  }

  /**
   * Unsubscribe a connection from a stream
   *
   * @param {string} connectionId - Connection identifier
   * @param {string} streamName - Stream/channel name to unsubscribe from
   * @returns {Promise<void>}
   */
  async unsubscribe(connectionId, streamName) {
    const connection = this.connections.get(connectionId)

    if (connection) {
      connection.streams.delete(streamName)
    }

    await this._removeFromStream(connectionId, streamName)
  }

  /**
   * Remove a connection from a stream
   *
   * @param {string} connectionId - Connection identifier
   * @param {string} streamName - Stream name
   * @private
   */
  async _removeFromStream(connectionId, streamName) {
    const subscribers = this.streams.get(streamName)

    if (subscribers) {
      subscribers.delete(connectionId)

      // If no more local subscribers, unsubscribe from Redis
      if (subscribers.size === 0) {
        this.streams.delete(streamName)

        if (this.subscriber) {
          try {
            await this.subscriber.unsubscribe(streamName)
          } catch (error) {
            this.logger.error?.(`BroadcastManager: Failed to unsubscribe from Redis channel ${streamName}: ${error.message}`)
          }
        }
      }
    }
  }

  /**
   * Broadcast a message to all subscribers of a stream
   *
   * This method publishes to Redis if available (for multi-server),
   * and also broadcasts to local subscribers.
   *
   * @param {string} streamName - Stream/channel name to broadcast to
   * @param {Object} data - Data to broadcast
   * @returns {Promise<number>} Number of local connections messaged
   *
   * @example
   * // Broadcast a new post to all subscribers of 'posts:new'
   * await broadcastManager.broadcast('posts:new', {
   *   type: 'post_created',
   *   post: { id: 1, title: 'Hello World' }
   * })
   */
  async broadcast(streamName, data) {
    // Publish to Redis for other servers
    if (this.redis) {
      try {
        await this.redis.publish(streamName, JSON.stringify(data))
      } catch (error) {
        this.logger.error?.(`BroadcastManager: Failed to publish to Redis: ${error.message}`)
        // Fall through to local broadcast
      }
    }

    // Broadcast to local subscribers
    return this._broadcastToLocalSubscribers(streamName, data)
  }

  /**
   * Broadcast to local subscribers only (called from Redis message handler)
   *
   * @param {string} streamName - Stream name
   * @param {Object} data - Data to send
   * @returns {number} Number of connections messaged
   * @private
   */
  _broadcastToLocalSubscribers(streamName, data) {
    const subscribers = this.streams.get(streamName)

    if (!subscribers || subscribers.size === 0) {
      return 0
    }

    const message = JSON.stringify({
      stream: streamName,
      data
    })

    let sentCount = 0

    for (const connectionId of subscribers) {
      const connection = this.connections.get(connectionId)

      if (connection && connection.ws) {
        try {
          connection.ws.send(message)
          sentCount++
        } catch (error) {
          // Connection might be closed
          this.logger.debug?.(`BroadcastManager: Failed to send to ${connectionId}: ${error.message}`)
        }
      }
    }

    return sentCount
  }

  /**
   * Get the number of subscribers for a stream
   *
   * @param {string} streamName - Stream name
   * @returns {number} Number of local subscribers
   */
  getSubscriberCount(streamName) {
    const subscribers = this.streams.get(streamName)
    return subscribers ? subscribers.size : 0
  }

  /**
   * Get all active streams
   *
   * @returns {string[]} Array of stream names
   */
  getActiveStreams() {
    return Array.from(this.streams.keys())
  }

  /**
   * Get connection count
   *
   * @returns {number} Number of active connections
   */
  getConnectionCount() {
    return this.connections.size
  }

  /**
   * Shutdown the broadcast manager
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe()
        await this.subscriber.quit()
      } catch (error) {
        // Ignore errors during shutdown
      }
      this.subscriber = null
    }

    this.connections.clear()
    this.streams.clear()
    this.initialized = false
  }
}

/**
 * Create a broadcast manager instance
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<BroadcastManager>} Initialized broadcast manager
 */
export async function createBroadcastManager(options = {}) {
  const manager = new BroadcastManager()
  await manager.initialize(options)
  return manager
}

export default BroadcastManager
