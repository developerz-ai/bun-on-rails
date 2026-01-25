# Installation

This guide will help you set up your development environment for BunOnRails.

## Prerequisites

### Bun Runtime

BunOnRails requires Bun 1.0 or later. Install Bun:

```bash
# macOS, Linux, WSL
curl -fsSL https://bun.sh/install | bash

# Homebrew
brew install oven-sh/bun/bun

# Windows (via scoop)
scoop install bun
```

Verify installation:

```bash
bun --version
# Should output: 1.x.x
```

### Docker (Recommended)

For local development with PostgreSQL and Redis:

```bash
# macOS
brew install --cask docker

# Linux
sudo apt install docker.io docker-compose

# Windows
# Download Docker Desktop from docker.com
```

### Database Options

**Development** (choose one):
- SQLite - Zero setup, included with Bun
- PostgreSQL via Docker - Recommended for production parity

**Production**:
- PostgreSQL (recommended)
- MySQL/MariaDB (supported)

## Installing BunOnRails

### Global CLI Installation

Install the BunOnRails CLI globally:

```bash
bun add -g @bun-on-rails
```

Verify installation:

```bash
bor --version
# Should output: 0.x.x
```

### Project Creation

Create a new BunOnRails application:

```bash
bun create bun-on-rails myapp
cd myapp
```

This creates a new project with the standard directory structure.

## Development Environment Setup

### With Docker (Recommended)

Start all services and set up the database:

```bash
bun setup
```

This command:
1. Generates `docker-compose.yml` with PostgreSQL, Redis, and Mailhog
2. Starts all Docker containers with health checks
3. Creates the development and test databases
4. Runs all pending migrations
5. Loads seed data
6. Generates `.env.development.local`

### Without Docker

If you prefer to manage services yourself:

```bash
# Create .env.development.local with your database URLs
cat > .env.development.local << EOF
DATABASE_URL=postgres://user:pass@localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379
EOF

# Create database and run migrations
bun db:create
bun db:migrate
bun db:seed
```

## Starting the Development Server

```bash
bun dev
```

Your application is now running at `http://localhost:3000`.

The development server includes:
- Hot module replacement
- Automatic restart on config changes
- Request logging
- Error overlay

## Editor Setup

### VS Code

Install recommended extensions:

```bash
code --install-extension bunlang.bun
code --install-extension bradlc.vscode-tailwindcss
code --install-extension dbaeumer.vscode-eslint
```

The project includes a `.vscode/settings.json` with optimal settings.

### JetBrains IDEs

BunOnRails projects work out of the box with WebStorm and other JetBrains IDEs. Install the Bun plugin for enhanced support.

## Verifying Your Installation

Create a simple test to verify everything works:

```bash
# Generate a scaffold
bun generate scaffold Post title:string body:text

# Run migrations
bun db:migrate

# Start the server
bun dev
```

Visit `http://localhost:3000/posts` - you should see the posts index page.

## Troubleshooting

### Bun Not Found

If `bun` command is not found after installation:

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

### Docker Permission Denied

On Linux, you may need to add your user to the docker group:

```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### Port Already in Use

If port 3000 is in use:

```bash
# Use a different port
PORT=4000 bun dev
```

### Database Connection Failed

Check that Docker services are running:

```bash
bun docker:status
```

Or check your `DATABASE_URL` in `.env.development.local`.

## Next Steps

Now that you have BunOnRails installed:

1. Follow the [Quick Start](./quick-start.md) to build your first app
2. Learn about the [Project Structure](./project-structure.md)
3. Explore the [Core Concepts](../core-concepts/philosophy.md)
