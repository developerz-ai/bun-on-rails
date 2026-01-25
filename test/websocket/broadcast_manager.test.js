/**
 * BroadcastManager Tests
 *
 * Unit tests for WebSocket broadcast functionality
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { BroadcastManager, createBroadcastManager } from '../../src/websocket/broadcast_manager.js'

describe('BroadcastManager', () => {
  let manager

  beforeEach(async () => {
    manager = new BroadcastManager()
    await manager.initialize()
  })

  afterEach(async () => {
    if (manager) {
      await manager.shutdown()
    }
  })

  describe('constructor', () => {
    test('initializes with default values', () => {
      const freshManager = new BroadcastManager()

      expect(freshManager.redis).toBeNull()
      expect(freshManager.subscriber).toBeNull()
      expect(freshManager.connections.size).toBe(0)
      expect(freshManager.streams.size).toBe(0)
      expect(freshManager.initialized).toBe(false)
    })
  })

  describe('initialize()', () => {
    test('sets initialized flag', async () => {
      const freshManager = new BroadcastManager()
      await freshManager.initialize()

      expect(freshManager.initialized).toBe(true)

      await freshManager.shutdown()
    })

    test('accepts custom logger', async () => {
      const customLogger = {
        debug: mock(() => {}),
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {})
      }

      const freshManager = new BroadcastManager()
      await freshManager.initialize({ logger: customLogger })

      expect(freshManager.logger).toBe(customLogger)

      await freshManager.shutdown()
    })

    test('returns the manager instance', async () => {
      const freshManager = new BroadcastManager()
      const result = await freshManager.initialize()

      expect(result).toBe(freshManager)

      await freshManager.shutdown()
    })

    test('does nothing if already initialized', async () => {
      const result1 = await manager.initialize()
      const result2 = await manager.initialize()

      expect(result1).toBe(manager)
      expect(result2).toBe(manager)
    })
  })

  describe('addConnection()', () => {
    test('registers a new connection', () => {
      const mockWs = { send: mock(() => {}) }

      manager.addConnection('conn-1', mockWs)

      expect(manager.connections.has('conn-1')).toBe(true)
      expect(manager.getConnectionCount()).toBe(1)
    })

    test('stores ws and empty streams set', () => {
      const mockWs = { send: mock(() => {}) }

      manager.addConnection('conn-1', mockWs)

      const connection = manager.connections.get('conn-1')
      expect(connection.ws).toBe(mockWs)
      expect(connection.streams).toBeInstanceOf(Set)
      expect(connection.streams.size).toBe(0)
    })
  })

  describe('removeConnection()', () => {
    test('removes a connection', () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)

      manager.removeConnection('conn-1')

      expect(manager.connections.has('conn-1')).toBe(false)
      expect(manager.getConnectionCount()).toBe(0)
    })

    test('cleans up stream subscriptions', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')

      expect(manager.getSubscriberCount('posts:new')).toBe(1)

      manager.removeConnection('conn-1')

      expect(manager.getSubscriberCount('posts:new')).toBe(0)
    })

    test('handles non-existent connection gracefully', () => {
      // Should not throw
      manager.removeConnection('non-existent')

      expect(manager.getConnectionCount()).toBe(0)
    })
  })

  describe('subscribe()', () => {
    test('subscribes a connection to a stream', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)

      await manager.subscribe('conn-1', 'posts:new')

      expect(manager.getSubscriberCount('posts:new')).toBe(1)
      const connection = manager.connections.get('conn-1')
      expect(connection.streams.has('posts:new')).toBe(true)
    })

    test('allows multiple connections to subscribe to same stream', async () => {
      const mockWs1 = { send: mock(() => {}) }
      const mockWs2 = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs1)
      manager.addConnection('conn-2', mockWs2)

      await manager.subscribe('conn-1', 'posts:new')
      await manager.subscribe('conn-2', 'posts:new')

      expect(manager.getSubscriberCount('posts:new')).toBe(2)
    })

    test('allows a connection to subscribe to multiple streams', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)

      await manager.subscribe('conn-1', 'posts:new')
      await manager.subscribe('conn-1', 'comments:new')

      const connection = manager.connections.get('conn-1')
      expect(connection.streams.has('posts:new')).toBe(true)
      expect(connection.streams.has('comments:new')).toBe(true)
    })

    test('ignores subscription for non-existent connection', async () => {
      await manager.subscribe('non-existent', 'posts:new')

      expect(manager.getSubscriberCount('posts:new')).toBe(0)
    })
  })

  describe('unsubscribe()', () => {
    test('unsubscribes a connection from a stream', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')

      await manager.unsubscribe('conn-1', 'posts:new')

      expect(manager.getSubscriberCount('posts:new')).toBe(0)
      const connection = manager.connections.get('conn-1')
      expect(connection.streams.has('posts:new')).toBe(false)
    })

    test('handles unsubscribe from non-existent stream gracefully', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)

      // Should not throw
      await manager.unsubscribe('conn-1', 'non-existent')
    })
  })

  describe('broadcast()', () => {
    test('sends message to all subscribers of a stream', async () => {
      const mockWs1 = { send: mock(() => {}) }
      const mockWs2 = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs1)
      manager.addConnection('conn-2', mockWs2)
      await manager.subscribe('conn-1', 'posts:new')
      await manager.subscribe('conn-2', 'posts:new')

      const sentCount = await manager.broadcast('posts:new', { id: 1 })

      expect(sentCount).toBe(2)
      expect(mockWs1.send).toHaveBeenCalledTimes(1)
      expect(mockWs2.send).toHaveBeenCalledTimes(1)
    })

    test('sends JSON formatted message with stream and data', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')

      await manager.broadcast('posts:new', { post: { id: 1, title: 'Hello' } })

      const sentMessage = mockWs.send.mock.calls[0][0]
      const parsed = JSON.parse(sentMessage)
      expect(parsed.stream).toBe('posts:new')
      expect(parsed.data.post.id).toBe(1)
      expect(parsed.data.post.title).toBe('Hello')
    })

    test('only sends to subscribers of the specific stream', async () => {
      const mockWs1 = { send: mock(() => {}) }
      const mockWs2 = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs1)
      manager.addConnection('conn-2', mockWs2)
      await manager.subscribe('conn-1', 'posts:new')
      await manager.subscribe('conn-2', 'comments:new')

      await manager.broadcast('posts:new', { id: 1 })

      expect(mockWs1.send).toHaveBeenCalledTimes(1)
      expect(mockWs2.send).not.toHaveBeenCalled()
    })

    test('returns 0 when no subscribers', async () => {
      const sentCount = await manager.broadcast('non-existent', { id: 1 })

      expect(sentCount).toBe(0)
    })

    test('handles send errors gracefully', async () => {
      const mockWs = {
        send: mock(() => {
          throw new Error('Connection closed')
        })
      }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')

      // Should not throw, just skip the failed send
      const sentCount = await manager.broadcast('posts:new', { id: 1 })

      expect(sentCount).toBe(0) // Failed send
    })
  })

  describe('getSubscriberCount()', () => {
    test('returns 0 for non-existent stream', () => {
      expect(manager.getSubscriberCount('non-existent')).toBe(0)
    })

    test('returns correct count for existing stream', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')

      expect(manager.getSubscriberCount('posts:new')).toBe(1)
    })
  })

  describe('getActiveStreams()', () => {
    test('returns empty array when no streams', () => {
      expect(manager.getActiveStreams()).toEqual([])
    })

    test('returns all active stream names', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')
      await manager.subscribe('conn-1', 'comments:new')

      const streams = manager.getActiveStreams()

      expect(streams).toContain('posts:new')
      expect(streams).toContain('comments:new')
      expect(streams.length).toBe(2)
    })
  })

  describe('getConnectionCount()', () => {
    test('returns 0 when no connections', () => {
      expect(manager.getConnectionCount()).toBe(0)
    })

    test('returns correct count', () => {
      manager.addConnection('conn-1', { send: () => {} })
      manager.addConnection('conn-2', { send: () => {} })

      expect(manager.getConnectionCount()).toBe(2)
    })
  })

  describe('shutdown()', () => {
    test('clears all connections', async () => {
      manager.addConnection('conn-1', { send: () => {} })
      manager.addConnection('conn-2', { send: () => {} })

      await manager.shutdown()

      expect(manager.getConnectionCount()).toBe(0)
    })

    test('clears all streams', async () => {
      const mockWs = { send: mock(() => {}) }
      manager.addConnection('conn-1', mockWs)
      await manager.subscribe('conn-1', 'posts:new')

      await manager.shutdown()

      expect(manager.getActiveStreams()).toEqual([])
    })

    test('resets initialized flag', async () => {
      await manager.shutdown()

      expect(manager.initialized).toBe(false)
    })
  })
})

describe('createBroadcastManager()', () => {
  test('creates and initializes a broadcast manager', async () => {
    const manager = await createBroadcastManager()

    expect(manager).toBeInstanceOf(BroadcastManager)
    expect(manager.initialized).toBe(true)

    await manager.shutdown()
  })

  test('passes options to initialize', async () => {
    const customLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    const manager = await createBroadcastManager({ logger: customLogger })

    expect(manager.logger).toBe(customLogger)

    await manager.shutdown()
  })
})

describe('BroadcastManager integration scenarios', () => {
  let manager

  beforeEach(async () => {
    manager = new BroadcastManager()
    await manager.initialize()
  })

  afterEach(async () => {
    await manager.shutdown()
  })

  test('simulates chat room scenario', async () => {
    // Create mock WebSocket connections for users
    const userMessages = { alice: [], bob: [], charlie: [] }

    const aliceWs = { send: (msg) => userMessages.alice.push(JSON.parse(msg)) }
    const bobWs = { send: (msg) => userMessages.bob.push(JSON.parse(msg)) }
    const charlieWs = { send: (msg) => userMessages.charlie.push(JSON.parse(msg)) }

    // Users join
    manager.addConnection('alice', aliceWs)
    manager.addConnection('bob', bobWs)
    manager.addConnection('charlie', charlieWs)

    // Alice and Bob join room:general, Charlie joins room:vip
    await manager.subscribe('alice', 'room:general')
    await manager.subscribe('bob', 'room:general')
    await manager.subscribe('charlie', 'room:vip')

    // Broadcast to general room
    await manager.broadcast('room:general', {
      type: 'message',
      from: 'system',
      text: 'Welcome to general!'
    })

    // Only Alice and Bob should receive
    expect(userMessages.alice.length).toBe(1)
    expect(userMessages.bob.length).toBe(1)
    expect(userMessages.charlie.length).toBe(0)

    // Charlie gets VIP message
    await manager.broadcast('room:vip', {
      type: 'message',
      from: 'system',
      text: 'Welcome VIP!'
    })

    expect(userMessages.charlie.length).toBe(1)
    expect(userMessages.alice.length).toBe(1) // Still 1
  })

  test('simulates real-time updates scenario', async () => {
    const updates = { viewer1: [], viewer2: [] }

    const viewer1Ws = { send: (msg) => updates.viewer1.push(JSON.parse(msg)) }
    const viewer2Ws = { send: (msg) => updates.viewer2.push(JSON.parse(msg)) }

    manager.addConnection('viewer1', viewer1Ws)
    manager.addConnection('viewer2', viewer2Ws)

    // Both subscribe to posts:123 (viewing same post)
    await manager.subscribe('viewer1', 'posts:123')
    await manager.subscribe('viewer2', 'posts:123')

    // Post is updated
    await manager.broadcast('posts:123', {
      action: 'updated',
      post: { id: 123, title: 'Updated Title' }
    })

    expect(updates.viewer1.length).toBe(1)
    expect(updates.viewer2.length).toBe(1)
    expect(updates.viewer1[0].data.action).toBe('updated')

    // viewer1 navigates away
    await manager.unsubscribe('viewer1', 'posts:123')

    // Another update
    await manager.broadcast('posts:123', {
      action: 'comment_added',
      comment: { id: 1, text: 'New comment' }
    })

    // Only viewer2 receives
    expect(updates.viewer1.length).toBe(1) // Still 1
    expect(updates.viewer2.length).toBe(2)
  })

  test('handles connection disconnect', async () => {
    const messages = { user1: [], user2: [] }

    const user1Ws = { send: (msg) => messages.user1.push(msg) }
    const user2Ws = { send: (msg) => messages.user2.push(msg) }

    manager.addConnection('user1', user1Ws)
    manager.addConnection('user2', user2Ws)

    await manager.subscribe('user1', 'notifications')
    await manager.subscribe('user2', 'notifications')

    expect(manager.getSubscriberCount('notifications')).toBe(2)

    // User1 disconnects
    manager.removeConnection('user1')

    expect(manager.getSubscriberCount('notifications')).toBe(1)
    expect(manager.getConnectionCount()).toBe(1)

    // Broadcast should only reach user2
    await manager.broadcast('notifications', { alert: 'Hello' })

    expect(messages.user1.length).toBe(0)
    expect(messages.user2.length).toBe(1)
  })
})
