# Sales Dashboard - Docker Setup with Playwright MCP

This guide explains how to run the Sales Dashboard application in Docker containers with Playwright MCP integration.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose v2.0+
- At least 4GB of available RAM (for Playwright browsers)

## Quick Start

### 1. Environment Setup

First, ensure you have a `.env.local` file with your configuration:

```bash
# Copy from example and edit
cp .env.local.example .env.local
# Edit with your actual values
nano .env.local
```

### 2. Simple Production Setup (Recommended)

Run the simple Docker setup:

```bash
# Build and start services
docker compose -f docker-compose.simple.yml up --build -d

# View logs
docker compose -f docker-compose.simple.yml logs -f

# Stop services
docker compose -f docker-compose.simple.yml down
```

### 3. Full Production Build (with Playwright MCP)

Run the automated setup script:

```bash
./docker-run.sh
```

Or manually with docker-compose:

```bash
# Build and start all services
docker compose up --build -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### 4. Development Mode

For development with hot reload:

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up --build

# Stop
docker compose -f docker-compose.dev.yml down
```

## Services

### Sales Dashboard (Next.js)
- **Port**: 3100 (Simple setup), 3000 (Full setup)
- **URL**: http://localhost:3100 (Simple), http://localhost:3000 (Full)
- **Description**: Main dashboard application

### Playwright MCP Server
- **Port**: 3010 (Simple setup), 3001 (Full setup)
- **URL**: http://localhost:3010 (Simple), http://localhost:3001 (Full)
- **Description**: Model Context Protocol server with Playwright automation capabilities

## Docker Configuration Files

- `Dockerfile.nextjs` - Production build for Next.js app
- `Dockerfile.dev` - Development build with hot reload
- `Dockerfile.playwright-mcp` - Playwright MCP server
- `docker-compose.yml` - Production services
- `docker-compose.dev.yml` - Development services
- `.dockerignore` - Files to exclude from build context

## Environment Variables

Required in `.env.local`:

```env
# BigQuery Configuration
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS_JSON='{...}'

# Microsoft Graph (optional)
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_SECRET=your-client-secret

# Application
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs sales-dashboard
docker-compose logs playwright-mcp

# Rebuild from scratch
docker-compose down --volumes --remove-orphans
docker-compose build --no-cache
docker-compose up -d
```

### Playwright Browser Issues
```bash
# Reinstall browsers in container
docker-compose exec playwright-mcp npx playwright install

# Check browser availability
docker-compose exec playwright-mcp npx playwright install --dry-run
```

### Performance Issues
- Ensure Docker has at least 4GB RAM allocated
- Close unnecessary applications
- Use production build for better performance

### Networking Issues
```bash
# Check network connectivity
docker-compose exec sales-dashboard ping playwright-mcp

# Inspect networks
docker network ls
docker network inspect sales-dashboard_app-network
```

## Development Workflow

1. **Code Changes**: Edit files locally (development mode will auto-reload)
2. **Database Changes**: Restart containers if schema changes
3. **Dependencies**: Rebuild containers after package.json changes
4. **Testing**: Use Playwright MCP for automated testing

## Useful Commands

```bash
# View running containers
docker-compose ps

# Access container shell
docker-compose exec sales-dashboard sh
docker-compose exec playwright-mcp bash

# View resource usage
docker stats

# Clean up everything
docker-compose down --volumes --remove-orphans
docker system prune -a
```

## Production Deployment

For production deployment, ensure:

1. Update environment variables for production
2. Use proper secrets management
3. Configure proper networking/reverse proxy
4. Set up monitoring and logging
5. Regular backups of volumes

## Performance Tips

- Use `docker-compose.yml` for production (smaller images)
- Use `docker-compose.dev.yml` for development (faster rebuilds)
- Regularly clean up unused images: `docker image prune`
- Monitor resource usage with `docker stats`