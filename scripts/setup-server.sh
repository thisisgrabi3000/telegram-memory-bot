#!/bin/bash
#
# Server Setup Script for Family Memories App (famories.info)
# Run on fresh Ubuntu 22.04 VPS as root
#
# Usage: bash setup-server.sh [domain.com]
# Default domain: famories.info
#
set -e

DOMAIN=${1:-"famories.info"}
APP_DIR="/var/www/memory-app"
APP_USER="memoryapp"

echo "============================================"
echo "  Family Memories - Server Setup"
echo "  Domain: $DOMAIN"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  log_error "Please run as root"
  exit 1
fi

# ============================================
# 1. System Update
# ============================================
log_info "Updating system packages..."
apt update && apt upgrade -y

# ============================================
# 2. Install Node.js 20
# ============================================
log_info "Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
else
  log_warn "Node.js already installed: $(node -v)"
fi

log_info "Node.js version: $(node -v)"
log_info "npm version: $(npm -v)"

# ============================================
# 3. Install Git
# ============================================
log_info "Installing Git..."
apt install -y git

# ============================================
# 4. Install PM2
# ============================================
log_info "Installing PM2..."
npm install -g pm2

# ============================================
# 5. Install Nginx
# ============================================
log_info "Installing Nginx..."
apt install -y nginx

# ============================================
# 6. Install Certbot (for SSL)
# ============================================
log_info "Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# ============================================
# 7. Configure Firewall (UFW)
# ============================================
log_info "Configuring firewall..."
apt install -y ufw

# Allow SSH first to avoid lockout
ufw allow OpenSSH
ufw allow 'Nginx Full'

# Enable firewall (non-interactive)
echo "y" | ufw enable

log_info "Firewall status:"
ufw status

# ============================================
# 8. Create App User
# ============================================
log_info "Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /bin/false $APP_USER
fi

# ============================================
# 9. Create App Directory
# ============================================
log_info "Creating app directory at $APP_DIR..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/data
mkdir -p $APP_DIR/uploads
mkdir -p $APP_DIR/temp
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/src/prompts

# ============================================
# 10. Configure Nginx for famories.info
# ============================================
log_info "Configuring Nginx for $DOMAIN..."

cat > /etc/nginx/sites-available/memory-app << NGINX_CONFIG
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Frontend (static files)
    root /var/www/memory-app/web/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }

    # Webhook proxy (Telegram)
    location /webhook/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check proxy
    location /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    # Uploaded files (photos, audio)
    location /uploads/ {
        alias /var/www/memory-app/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Frontend SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_CONFIG

# Enable site
ln -sf /etc/nginx/sites-available/memory-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t
systemctl reload nginx

# ============================================
# 11. Create PM2 Ecosystem File
# ============================================
log_info "Creating PM2 ecosystem file..."

cat > $APP_DIR/ecosystem.config.js << 'PM2_CONFIG'
module.exports = {
  apps: [{
    name: 'famories',
    script: 'dist/index.js',
    cwd: '/var/www/memory-app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/var/www/memory-app/logs/error.log',
    out_file: '/var/www/memory-app/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
PM2_CONFIG

# ============================================
# 12. Create .env Template
# ============================================
log_info "Creating .env template..."

cat > $APP_DIR/.env.template << ENV_TEMPLATE
# ============================================
# Family Memories - Production Configuration
# Domain: $DOMAIN
# ============================================

# Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# OpenAI API Key (for transcription and summarization)
OPENAI_API_KEY=your_openai_api_key

# Server Configuration
PORT=3000
NODE_ENV=production

# Database
DATABASE_PATH=./data/memory.db

# Webhook URL
WEBHOOK_URL=https://$DOMAIN

# Web App Password (shared family password)
# Leave empty for no password protection
WEB_PASSWORD=

# Allowed Telegram Chats (comma-separated, leave empty for all)
ALLOWED_TELEGRAM_CHAT_IDS=
ENV_TEMPLATE

if [ ! -f "$APP_DIR/.env" ]; then
  cp $APP_DIR/.env.template $APP_DIR/.env
  log_warn "Created .env file - please edit with your actual values!"
fi

# ============================================
# 13. Set Permissions
# ============================================
log_info "Setting permissions..."
chown -R $APP_USER:$APP_USER $APP_DIR
chmod -R 755 $APP_DIR
chmod 600 $APP_DIR/.env

# ============================================
# 14. Setup PM2 Startup
# ============================================
log_info "Setting up PM2 startup..."
pm2 startup systemd -u root --hp /root
pm2 save

# ============================================
# 15. SSL Certificate
# ============================================
log_info "Setting up SSL certificate for $DOMAIN..."

# Check if domain resolves to this server
SERVER_IP=$(curl -s ifconfig.me)
DOMAIN_IP=$(dig +short $DOMAIN | head -1)

if [ "$SERVER_IP" == "$DOMAIN_IP" ]; then
  certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect
  log_info "SSL certificate installed successfully!"
else
  log_warn "Domain $DOMAIN does not point to this server ($SERVER_IP)"
  log_warn "Current DNS: $DOMAIN_IP"
  log_warn ""
  log_warn "Please point your domain to $SERVER_IP and then run:"
  log_warn "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# ============================================
# 16. Create Webhook Setup Script
# ============================================
log_info "Creating webhook setup script..."

cat > $APP_DIR/setup-webhook.sh << 'WEBHOOK_SCRIPT'
#!/bin/bash
# Run this after deploy to set up Telegram webhook

if [ -z "$1" ]; then
  echo "Usage: ./setup-webhook.sh <TELEGRAM_BOT_TOKEN>"
  exit 1
fi

BOT_TOKEN=$1
WEBHOOK_URL="https://famories.info/webhook/telegram"

echo "Setting Telegram webhook to: $WEBHOOK_URL"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\"}"

echo ""
echo "Verifying webhook..."
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
WEBHOOK_SCRIPT

chmod +x $APP_DIR/setup-webhook.sh

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo -e "${GREEN}  Setup Complete!${NC}"
echo "============================================"
echo ""
echo "Domain: $DOMAIN"
echo "Server IP: $(curl -s ifconfig.me)"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit the .env file with your credentials:"
echo "   nano $APP_DIR/.env"
echo ""
echo "2. From your local machine, run deploy.sh:"
echo "   ./scripts/deploy.sh"
echo ""
echo "3. After deploy, set up Telegram webhook:"
echo "   cd $APP_DIR && ./setup-webhook.sh YOUR_BOT_TOKEN"
echo ""
echo "4. If SSL not set up, point domain to this server and run:"
echo "   certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check app status"
echo "  pm2 logs famories   - View logs"
echo "  pm2 restart famories - Restart app"
echo "  nginx -t            - Test nginx config"
echo ""
echo "URLs after deployment:"
echo "  Web App:  https://$DOMAIN"
echo "  API:      https://$DOMAIN/api/memories"
echo "  Health:   https://$DOMAIN/health"
echo "  Webhook:  https://$DOMAIN/webhook/telegram"
echo ""
