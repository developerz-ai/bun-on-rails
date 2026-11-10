/**
 * Channel - WebSocket channel base class
 */

import { NotImplementedError } from '../support/not_implemented.js'

export class Channel {
  constructor(socket, params) {
    this.socket = socket
    this.params = params
    this.streams = []
  }

  /**
   * Called when client subscribes to channel
   */
  async subscribed() {
    // Override in subclass
  }

  /**
   * Called when client unsubscribes
   */
  async unsubscribed() {
    // Override in subclass
  }

  /**
   * Called when message received from client
   * @param {Object} data
   */
  async receive(_data) {
    // Override in subclass
  }

  /**
   * Subscribe to a stream
   * @param {string} streamName
   */
  async stream(_streamName) {
    // TODO: Subscribe to Redis pub/sub
    throw new NotImplementedError('Channel#stream', 'WebSocket channels')
  }

  /**
   * Send data to this client
   * @param {Object} data
   */
  send(_data) {
    // TODO: Send via WebSocket
    throw new NotImplementedError('Channel#send', 'WebSocket channels')
  }

  /**
   * Broadcast to all subscribers of a stream
   * @param {string} streamName
   * @param {Object} data
   */
  broadcast(_streamName, _data) {
    // TODO: Publish to Redis pub/sub
    throw new NotImplementedError('Channel#broadcast', 'WebSocket channels')
  }

  /**
   * Reject the subscription
   */
  reject() {
    // TODO: Close connection with rejection
    throw new NotImplementedError('Channel#reject', 'WebSocket channels')
  }
}

/**
 * WebSocket Server
 */
export class WebSocketServer {
  constructor(options = {}) {
    this.options = options
    this.channels = new Map()
    this.connections = new Map()
    this.redis = null
  }

  /**
   * Register a channel class
   * @param {string} name
   * @param {typeof Channel} ChannelClass
   */
  registerChannel(name, ChannelClass) {
    this.channels.set(name, ChannelClass)
  }

  /**
   * Start the WebSocket server
   * @param {number} port
   */
  async start(_port) {
    // TODO: Initialize Redis pub/sub
    // TODO: Start Bun WebSocket server
    throw new NotImplementedError('WebSocketServer#start', 'WebSocket channels')
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws
   */
  handleConnection(_ws) {
    // TODO: Generate connection ID
    // TODO: Store connection
    // TODO: Set up message handlers
    throw new NotImplementedError('WebSocketServer#handleConnection', 'WebSocket channels')
  }

  /**
   * Handle incoming message
   * @param {WebSocket} ws
   * @param {string} message
   */
  async handleMessage(_ws, _message) {
    // TODO: Parse message
    // TODO: Route to channel action
    // TODO: Handle subscribe/unsubscribe/message
    throw new NotImplementedError('WebSocketServer#handleMessage', 'WebSocket channels')
  }

  /**
   * Handle connection close
   * @param {WebSocket} ws
   */
  handleClose(_ws) {
    // TODO: Clean up subscriptions
    // TODO: Remove connection
    throw new NotImplementedError('WebSocketServer#handleClose', 'WebSocket channels')
  }

  /**
   * Broadcast to a channel
   * @param {string} channel
   * @param {Object} data
   */
  broadcast(_channel, _data) {
    // TODO: Publish to Redis
    // TODO: Will be received by all server instances
    throw new NotImplementedError('WebSocketServer#broadcast', 'WebSocket channels')
  }

  /**
   * Stop the server
   */
  async stop() {
    // TODO: Close all connections
    // TODO: Close Redis connection
    throw new NotImplementedError('WebSocketServer#stop', 'WebSocket channels')
  }
}

/**
 * Connection - Represents a single WebSocket connection
 */
export class Connection {
  constructor(ws, id) {
    this.ws = ws
    this.id = id
    this.subscriptions = new Map()
    this.user = null
  }

  /**
   * Subscribe to a channel
   * @param {string} channelName
   * @param {Object} params
   */
  async subscribe(_channelName, _params) {
    // TODO: Instantiate channel
    // TODO: Call subscribed()
    // TODO: Store subscription
    throw new NotImplementedError('Connection#subscribe', 'WebSocket channels')
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channelName
   */
  async unsubscribe(_channelName) {
    // TODO: Call unsubscribed()
    // TODO: Remove subscription
    throw new NotImplementedError('Connection#unsubscribe', 'WebSocket channels')
  }

  /**
   * Send data to this connection
   * @param {Object} data
   */
  send(data) {
    this.ws.send(JSON.stringify(data))
  }

  /**
   * Authenticate the connection
   * @param {Object} token
   */
  async authenticate(_token) {
    // TODO: Verify token
    // TODO: Load user
    throw new NotImplementedError('Connection#authenticate', 'WebSocket channels')
  }
}
