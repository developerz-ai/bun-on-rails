/**
 * brails dev - Development server
 */

export const devCommand = {
  name: 'dev',
  description: 'Start development server',

  async run(args) {
    const port = args.options.port || process.env.PORT || 3000

    console.log(`Starting development server on port ${port}...`)

    // TODO: Load application
    // TODO: Start file watcher for hot reload
    // TODO: Start HTTP server
    // TODO: Start WebSocket server
    // TODO: Show routes

    console.log(`
BunOnRails development server running:

  Local:    http://localhost:${port}
  Network:  http://192.168.x.x:${port}

Press Ctrl+C to stop.
`)

    // TODO: Keep process running
    // TODO: Watch for file changes
    // TODO: Restart on config changes
  }
}
