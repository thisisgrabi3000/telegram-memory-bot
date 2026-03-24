#!/bin/bash
#
# Deploy Script for Family Memories App (famories.info)
# Run locally on Mac to build and deploy to server
#
# Usage: ./deploy.sh [server] [user]
#
set -e

# Configuration
SERVER=${1:-"212.227.84.185"}
USER=${2:-"root"}
APP_DIR="/var/www/memory-app"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="famories.info"

echo "============================================"
echo "  Family Memories - Deploy to Production"
echo "============================================"
echo ""
echo "Server:  $USER@$SERVER"
echo "Domain:  $DOMAIN"
echo "Local:   $LOCAL_DIR"
echo "Remote:  $APP_DIR"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# 1. Build Backend (TypeScript)
# ============================================
log_info "Building backend..."
cd "$LOCAL_DIR"
npm run build

# ============================================
# 2. Build Frontend (Vite)
# ============================================
log_info "Building frontend for production..."
cd "$LOCAL_DIR/web"

# Set production API URL (empty = same origin)
export VITE_API_URL=""
npm run build

cd "$LOCAL_DIR"

# ============================================
# 3. Sync Files to Server
# ============================================
log_info "Syncing files to server..."

# Create exclude file for rsync
EXCLUDE_FILE=$(mktemp)
cat > "$EXCLUDE_FILE" << 'EXCLUDES'
node_modules
.git
.env
.env.local
*.log
temp/
.DS_Store
*.sqlite
*.db
data/
uploads/
logs/
.agents/
.claude/
EXCLUDES

# Sync backend dist
rsync -avz --progress --delete \
  --exclude-from="$EXCLUDE_FILE" \
  "$LOCAL_DIR/dist/" \
  "$USER@$SERVER:$APP_DIR/dist/"

# Sync package files
rsync -avz --progress \
  "$LOCAL_DIR/package.json" \
  "$LOCAL_DIR/package-lock.json" \
  "$USER@$SERVER:$APP_DIR/"

# Sync frontend build
rsync -avz --progress --delete \
  "$LOCAL_DIR/web/dist/" \
  "$USER@$SERVER:$APP_DIR/web/dist/"

# Sync prompts directory
rsync -avz --progress --delete \
  "$LOCAL_DIR/src/prompts/" \
  "$USER@$SERVER:$APP_DIR/src/prompts/"

# Sync ecosystem config (but don't overwrite if exists)
rsync -avz --ignore-existing \
  "$LOCAL_DIR/scripts/ecosystem.config.js" \
  "$USER@$SERVER:$APP_DIR/" 2>/dev/null || true

rm "$EXCLUDE_FILE"

# ============================================
# 4. Install Dependencies on Server
# ============================================
log_info "Installing production dependencies on server..."
ssh "$USER@$SERVER" "cd $APP_DIR && npm ci --omit=dev"

# ============================================
# 5. Run Database Migrations
# ============================================
log_info "Running database migrations..."
ssh "$USER@$SERVER" "cd $APP_DIR && node dist/db/migrate.js" || log_warn "Migration skipped (may already be applied)"

# ============================================
# 6. Restart PM2
# ============================================
log_info "Restarting application..."
ssh "$USER@$SERVER" "cd $APP_DIR && pm2 restart ecosystem.config.js --update-env 2>/dev/null || pm2 start ecosystem.config.js"
ssh "$USER@$SERVER" "pm2 save"

# ============================================
# 7. Show Status
# ============================================
echo ""
log_info "Checking application status..."
ssh "$USER@$SERVER" "pm2 status"

# ============================================
# 8. Verify Deployment
# ============================================
echo ""
log_info "Verifying deployment..."

# Check health endpoint
sleep 2
HEALTH_CHECK=$(ssh "$USER@$SERVER" "curl -s http://localhost:3000/health" 2>/dev/null || echo "failed")

if echo "$HEALTH_CHECK" | grep -q "ok"; then
  echo -e "${GREEN}Health check passed!${NC}"
else
  log_warn "Health check returned: $HEALTH_CHECK"
fi

echo ""
echo "============================================"
echo -e "${GREEN}  Deploy Complete!${NC}"
echo "============================================"
echo ""
echo "URLs:"
echo "  Web App:  https://$DOMAIN"
echo "  API:      https://$DOMAIN/api/memories"
echo "  Health:   https://$DOMAIN/health"
echo ""
echo "Commands:"
echo "  View logs:     ssh $USER@$SERVER 'pm2 logs famories'"
echo "  Restart:       ssh $USER@$SERVER 'pm2 restart famories'"
echo "  Set webhook:   ssh $USER@$SERVER 'cd $APP_DIR && ./setup-webhook.sh YOUR_TOKEN'"
echo ""
