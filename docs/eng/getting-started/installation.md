# Installation

## Prerequisites

BunOnRails runs on [Bun](https://bun.sh) 1.0 or later:

```bash
curl -fsSL https://bun.sh/install | bash   # macOS, Linux, WSL
bun --version
```

Nothing else is needed to create and run an app.

## Install the CLI

```bash
bun add -g bun-on-rails
brails --version   # BunOnRails v0.1.0
```

This puts the `brails` command on your `PATH`.

## Create an app

```bash
brails new myapp
cd myapp
brails dev
```

`brails new` writes the app and runs `bun install` in it. `brails dev` serves it at
`http://localhost:3000`:

```bash
curl localhost:3000/health   # {"status":"ok"}
```

[Project Structure](./project-structure.md) shows what was generated, and the
[Quick Start](./quick-start.md) adds your first resource.

## Databases

The app connects to PostgreSQL at boot when `DATABASE_URL` is set (put it in `.env`), and runs
without a database when it is not. [Database Overview](../database/overview.md) covers models
and queries. The database commands (`brails db:create`, `brails db:migrate` and the rest) are
not implemented yet: each exits with an error, and `brails help` lists every planned command.

Configuration that should stay out of git goes in `.env`, which Bun loads automatically.
`.env.example` lists the variable names, and `.env` is never committed.

## Troubleshooting

**`brails: command not found`**: Bun's global bin directory is not on your `PATH`. Add it to
your shell profile:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

**Port 3000 is taken**: pick another port:

```bash
PORT=4000 brails dev
```
