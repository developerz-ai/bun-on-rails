/**
 * Posts Channel - Real-time post updates
 */

import { Channel } from '../../../src/index.js'

export default class PostsChannel extends Channel {
  async subscribed() {
    // Subscribe to posts stream
    await this.stream('posts')

    console.log(`Client subscribed to posts channel`)
  }

  async unsubscribed() {
    console.log(`Client unsubscribed from posts channel`)
  }

  async receive(data) {
    // Handle incoming messages from clients
    if (data.action === 'typing') {
      // Broadcast typing indicator to others
      this.broadcast('posts', {
        type: 'typing',
        userId: this.params.userId
      })
    }
  }
}
