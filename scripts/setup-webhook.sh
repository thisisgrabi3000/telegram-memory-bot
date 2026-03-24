#!/bin/bash
#
# Set up Telegram Webhook for famories.info
# Run after deploying and setting up SSL
#
# Usage: ./setup-webhook.sh <BOT_TOKEN> [DOMAIN]
# Default domain: famories.info
#

BOT_TOKEN=$1
DOMAIN=${2:-"famories.info"}

if [ -z "$BOT_TOKEN" ]; then
  echo "Usage: ./setup-webhook.sh <BOT_TOKEN> [DOMAIN]"
  echo ""
  echo "Example: ./setup-webhook.sh 123456:ABC-DEF"
  echo "         ./setup-webhook.sh 123456:ABC-DEF custom-domain.com"
  echo ""
  echo "Default domain: famories.info"
  exit 1
fi

WEBHOOK_URL="https://$DOMAIN/webhook/telegram"

echo "============================================"
echo "  Setting up Telegram Webhook"
echo "============================================"
echo ""
echo "Domain:  $DOMAIN"
echo "Webhook: $WEBHOOK_URL"
echo ""

# Set webhook
echo "Setting webhook..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\"}")

echo "Response: $RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Webhook set successfully!"
else
  echo "❌ Failed to set webhook"
fi

echo ""

# Get webhook info
echo "Current webhook info:"
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo" | python3 -m json.tool 2>/dev/null || \
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"

echo ""
echo "============================================"
echo ""
echo "Test your bot by sending a message in Telegram!"
echo ""
