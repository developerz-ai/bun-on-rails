# Deployment

A BunOnRails app is one Bun process that serves plain HTTP. To deploy it, install its
dependencies, set its environment, and run `brails start`. There is no build step: the app is
plain JavaScript that Bun runs as it is.

## Start the server

An app made by `brails new` has a `start` script that runs `brails start` from the app's own
dependencies, so the server does not need the global CLI:

```bash
bun install --production
NODE_ENV=production bun run start
```

The process stops cleanly on `SIGTERM` and `SIGINT`.

| Setting     | How it is chosen                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Port        | `--port` (`brails start --port 8080`), else the `PORT` variable, else `server.port` in the config, else 3000 |
| Address     | `server.hostname` in the config, else `localhost`                                                            |
| Environment | `BUN_ENV`, else `NODE_ENV`, else `development`. It picks `config/environments/<env>.js`                      |

**Listen on all interfaces.** By default the server listens on `localhost` only, which a load
balancer on another host, or a port published from a container, cannot reach. Set the address:

**`config/server.js`**

```js
export default {
  hostname: "0.0.0.0",
};
```

**Set `NODE_ENV=production`.** With it, an error response says `Internal Server Error` instead of
the error's message. `BUN_ENV=production` picks the production config file, but only `NODE_ENV`
hides error messages.

**Terminate TLS in front of the app.** The server speaks plain HTTP, so put HTTPS on the load
balancer or reverse proxy that forwards to it.

## Docker

**`Dockerfile`**

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "start"]
```

**`.dockerignore`**

```text
node_modules
.env
```

This needs `config/server.js` from above: without it the server listens on the container's
`localhost` and the published port gets no answer. Pass secrets such as `DATABASE_URL` at run
time (`docker run -e DATABASE_URL=... -p 3000:3000 myapp`), not in the image.

## Health check

An app made by `brails new` routes `GET /health` to its `HealthController`, which answers `200`
with `{"status":"ok"}`. Point the platform's health check at it.

## State kept in memory

- **Sessions** live in the process's memory, the only built-in session store. A restart drops
  them, and two processes or containers do not share them.
- **The cache** (`this.cache` in a controller) is an in-memory store per process.

## Database

The app does not connect to a database on its own. Connect in an initializer and pass
`DATABASE_URL` in the environment (see [Connect to PostgreSQL](../database/overview.md#connect-to-postgresql)).
Run migrations with your migration script before starting the new version:
`bun run db/migrate.js` (see [Running migrations](../database/migrations.md#running-migrations)).

## Not implemented yet

- **A migration command for the release step.** `brails db:migrate` is not implemented yet (it exits 1). Use a migration script.
- **Background workers.** Jobs cannot be enqueued, so there is no worker process to run (see
  [Background Jobs](../jobs/overview.md)).
- **Shared sessions and cache.** The Redis store raises an error for sessions, and the Redis
  cache store's methods are stubs.
