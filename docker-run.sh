#!/bin/bash

# Docker setup script for Sales Dashboard with Playwright MCP

echo "🐳 Setting up Sales Dashboard with Playwright MCP in Docker..."

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  Warning: .env.local file not found. Creating a template..."
    cat > .env.local << EOF
# BigQuery Configuration
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS_JSON='{}'

# Microsoft Graph Configuration (if needed)
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_SECRET=your-client-secret

# Other environment variables
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
    echo "📝 Please update .env.local with your actual configuration values."
    echo "   Then run this script again."
    exit 1
fi

# Stop and remove existing containers
echo "🧹 Cleaning up existing containers..."
docker compose down --remove-orphans

# Build and start the services
echo "🔨 Building and starting services..."
docker compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker compose ps

# Show logs
echo "📋 Service logs:"
docker compose logs --tail=20

# Show access URLs
echo ""
echo "✅ Services are running!"
echo "🌐 Sales Dashboard: http://localhost:3000"
echo "🎭 Playwright MCP: http://localhost:3001"
echo ""
echo "📊 To view logs: docker compose logs -f"
echo "🛑 To stop: docker compose down"
echo ""