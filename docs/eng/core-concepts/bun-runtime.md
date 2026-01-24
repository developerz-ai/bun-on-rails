# The Bun Runtime

BunOnRails is built on Bun, a modern JavaScript runtime designed for speed and developer experience.

## Why Bun?

### All-in-One Toolkit

Bun combines multiple tools into one:

| Traditional Stack | Bun |
|------------------|-----|
| Node.js | Runtime |
| npm/yarn/pnpm | Package manager |
| webpack/esbuild | Bundler |
| babel | Transpiler |
| jest/mocha | Test runner |
| nodemon | File watcher |

### Performance

Bun is significantly faster than Node.js:

- **Startup**: 4x faster cold start
- **HTTP**: Native server implementation
- **SQLite**: Built-in native driver
- **Bundling**: Faster than esbuild
- **Tests**: Parallel by default

### Native APIs

Bun provides native implementations for common needs:

```javascript
// Built-in SQLite
const db = new Database('mydb.sqlite')

// Native file operations
const file = Bun.file('data.json')
const contents = await file.text()

// Built-in HTTP server
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('Hello')
  }
})

// Native WebSocket
Bun.serve({
  websocket: {
    message(ws, message) {
      ws.send('received: ' + message)
    }
  }
})
```

## How BunOnRails Uses Bun

### Package Management

```bash
# Fast dependency installation
bun install

# Add dependencies
bun add lodash
bun add -d typescript

# Run scripts
bun dev
bun test
```

### Bundling & Transpilation

No webpack configuration needed:

```javascript
// Just import - Bun handles it
import './styles.scss'
import data from './data.json'
import Component from './Component.tsx'
```

Features handled automatically:
- JSX/TSX transformation
- SCSS compilation
- JSON imports
- Path aliases
- Tree shaking
- Minification

### Test Runner

```javascript
import { test, expect, describe, beforeEach } from 'bun:test'

describe('User', () => {
  beforeEach(async () => {
    await User.destroyAll()
  })

  test('validates email presence', async () => {
    const user = await User.create({ name: 'Test' })
    expect(user.errors.email).toContain('is required')
  })
})
```

Run tests:

```bash
bun test                    # All tests
bun test --watch           # Watch mode
bun test user.test.js      # Specific file
bun test --filter "email"  # Filter by name
```

### HTTP Server

BunOnRails uses Bun's native HTTP server:

```javascript
// Internal implementation
Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(request) {
    // Framework routing and middleware
    return await router.handle(request)
  }
})
```

Benefits:
- Faster than Express/Fastify
- Native Request/Response objects
- No middleware overhead
- Automatic keep-alive

### WebSocket Server

Native WebSocket support:

```javascript
// Internal implementation
Bun.serve({
  websocket: {
    open(ws) {
      // Connection opened
    },
    message(ws, message) {
      // Handle message
    },
    close(ws) {
      // Connection closed
    }
  }
})
```

Used by BunOnRails channels for real-time features.

### File Operations

```javascript
// Reading files
const file = Bun.file('config.json')
const config = await file.json()

// Writing files
await Bun.write('output.txt', 'content')

// Streaming
const stream = file.stream()
```

### Environment Variables

Bun automatically loads `.env` files:

```bash
# .env
DATABASE_URL=postgres://localhost/myapp

# .env.development
LOG_LEVEL=debug

# .env.production
LOG_LEVEL=warn
```

Access in code:

```javascript
const dbUrl = process.env.DATABASE_URL
// or
const dbUrl = Bun.env.DATABASE_URL
```

## Bun Configuration

### bunfig.toml

Optional configuration file:

```toml
# bunfig.toml

[install]
# Faster installs with frozen lockfile
frozen = true

[run]
# Bun's shell for scripts
shell = "bun"

[test]
# Coverage output
coverage = true
coverageDir = "coverage"

# Test timeout
timeout = 5000
```

### TypeScript Support

Bun runs TypeScript natively - no compilation step:

```typescript
// Works immediately
interface User {
  id: number
  name: string
}

const user: User = await User.find(1)
```

Configure via `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"]
  }
}
```

## Development vs Production

### Development Mode

```bash
bun dev
```

- Hot module replacement
- Source maps
- Detailed error messages
- No optimization

### Production Mode

```bash
bun run build
bun start
```

- Code bundling
- Tree shaking
- Minification
- Multi-process clustering

## Bun vs Node.js

### Compatibility

Bun aims for Node.js compatibility:

```javascript
// Node.js APIs work
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// npm packages work
import lodash from 'lodash'
import express from 'express'  // Compatible, but use Bun.serve
```

### Differences

| Feature | Bun | Node.js |
|---------|-----|---------|
| Package manager | Built-in | npm/yarn/pnpm |
| TypeScript | Native | Requires build |
| JSX | Native | Requires build |
| Bundler | Built-in | webpack/esbuild |
| Test runner | Built-in | Jest/Mocha |
| SQLite | Native | Better-sqlite3 |
| `.env` loading | Automatic | dotenv package |

### When Node.js Compatibility Matters

Some npm packages may have Node.js-specific code. BunOnRails:

1. Tests against major packages
2. Provides polyfills where needed
3. Documents known incompatibilities
4. Offers alternatives for unsupported packages

## Performance Tips

### Leverage Native APIs

```javascript
// Prefer Bun's native file API
const data = await Bun.file('data.json').json()

// Over Node.js fs
import fs from 'fs/promises'
const data = JSON.parse(await fs.readFile('data.json', 'utf-8'))
```

### Use Built-in Features

```javascript
// Bun's built-in password hashing
const hash = await Bun.password.hash('password')
const valid = await Bun.password.verify('password', hash)

// Bun's built-in SQLite for development
const db = new Database(':memory:')
```

### Parallel Processing

```javascript
// Bun handles parallelism well
const results = await Promise.all([
  fetch('/api/users'),
  fetch('/api/posts'),
  fetch('/api/comments')
])
```

## Summary

BunOnRails leverages Bun for:

- **Fast startup** - Sub-second cold start
- **Native performance** - HTTP, WebSocket, SQLite
- **Zero configuration** - TypeScript, JSX, bundling
- **Developer experience** - Watch mode, fast tests
- **Production ready** - Clustering, optimization

This foundation enables BunOnRails to deliver Rails-like productivity with JavaScript performance.
