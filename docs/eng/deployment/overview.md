# Deployment

> **Work in Progress**: This documentation is being actively developed.

BunOnRails applications deploy anywhere that runs Bun or Docker. Zero configuration for most platforms.

## Deployment Options

### Platform-as-a-Service (Easiest)

| Platform | Difficulty | Notes |
|----------|------------|-------|
| Railway | ⭐ Easy | Auto-detects Bun, free tier |
| Render | ⭐ Easy | Native Bun support |
| Fly.io | ⭐⭐ Medium | Great for edge deployment |
| Heroku | ⭐⭐ Medium | Requires buildpack |

### Container Platforms

| Platform | Difficulty | Notes |
|----------|------------|-------|
| Docker + Any Cloud | ⭐⭐ Medium | Most flexible |
| AWS ECS | ⭐⭐⭐ Advanced | Scalable |
| Google Cloud Run | ⭐⭐ Medium | Serverless containers |
| DigitalOcean App Platform | ⭐⭐ Medium | Simple container hosting |

### Self-Hosted

| Option | Difficulty | Notes |
|--------|------------|-------|
| VPS + Docker Compose | ⭐⭐ Medium | Full control |
| Kubernetes | ⭐⭐⭐⭐ Advanced | Enterprise scale |

## Quick Deploy: Railway

1. Push to GitHub
2. Connect Railway to your repo
3. Railway auto-detects and deploys

```bash
# That's it. Railway handles:
# - Bun detection
# - Database provisioning
# - Environment variables
# - SSL certificates
# - Automatic deploys
```

## Quick Deploy: Render

1. Create `render.yaml`:

```yaml
services:
  - type: web
    name: myapp
    runtime: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: myapp-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: myapp-redis
          property: connectionString

databases:
  - name: myapp-db
    plan: starter

services:
  - type: redis
    name: myapp-redis
    plan: starter
```

2. Connect to GitHub
3. Deploy

## Quick Deploy: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch
fly launch

# Deploy
fly deploy
```

## Environment Variables

Required for production:

```bash
# Database
DATABASE_URL=postgres://user:pass@host:5432/dbname

# Redis (for sessions, cache, jobs)
REDIS_URL=redis://host:6379

# Security
SECRET_KEY_BASE=your-256-bit-secret
MASTER_KEY=your-credentials-key

# Server
PORT=3000
NODE_ENV=production
```

## Procfile

For platforms that use Procfiles:

```procfile
web: bun start
worker: brails jobs:work
release: brails db:migrate
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3000
CMD ["bun", "start"]
```

### docker-compose.yml (Production)

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - '3000:3000'
    environment:
      - DATABASE_URL
      - REDIS_URL
      - SECRET_KEY_BASE
    depends_on:
      - postgres
      - redis

  worker:
    build: .
    command: brails jobs:work
    environment:
      - DATABASE_URL
      - REDIS_URL
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Database Migrations

### Automatic (Recommended)

Add to your deployment pipeline:

```bash
brails db:migrate
```

Most platforms support a "release" phase that runs before the new version goes live.

### Manual

```bash
# SSH into production server
brails db:migrate
```

## Health Checks

BunOnRails provides built-in health endpoints:

```
GET /health          → Basic status
GET /health/detailed → DB, Redis, queues status
```

Configure in your platform:
- Health check path: `/health`
- Expected response: `200 OK`

## SSL/TLS

Most platforms handle SSL automatically. For self-hosted:

```nginx
# Nginx reverse proxy
server {
    listen 443 ssl;
    server_name myapp.com;

    ssl_certificate /etc/letsencrypt/live/myapp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myapp.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Scaling

### Horizontal Scaling

```bash
# Multiple web processes
WEB_CONCURRENCY=4 bun start

# Multiple job workers
brails jobs:work --concurrency=10
```

### Platform-Specific

- **Railway**: Adjust replicas in dashboard
- **Render**: Auto-scaling available
- **Fly.io**: `fly scale count 3`
- **Docker**: Use Docker Swarm or Kubernetes

## Checklist

Before deploying:

- [ ] Set all required environment variables
- [ ] Run `bun run build` for production assets
- [ ] Test with `NODE_ENV=production`
- [ ] Set up database backups
- [ ] Configure error monitoring (Sentry, etc.)
- [ ] Set up log aggregation
- [ ] Test health checks
- [ ] Review security headers

## Coming Soon

- Detailed platform guides
- CI/CD examples
- Monitoring setup
- Performance tuning
- Zero-downtime deployments
