#!/usr/bin/env bash
set -euo pipefail

DOMAIN="tasks.gideonsolutions.us"
EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL environment variable}"
COMPOSE="docker compose"

echo "==> Obtaining SSL certificate for ${DOMAIN}"

# Create a temporary nginx config for HTTP-only ACME challenge
TEMP_CONF=$(mktemp)
cat > "${TEMP_CONF}" <<'NGINX'
events { worker_connections 128; }
http {
    server {
        listen 80;
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        location / {
            return 444;
        }
    }
}
NGINX

echo "==> Starting temporary HTTP-only Nginx for ACME challenge"
docker run -d --name gideon-certbot-nginx \
    -p 80:80 \
    -v "${TEMP_CONF}:/etc/nginx/nginx.conf:ro" \
    -v gideon-tasks_certbot_webroot:/var/www/certbot \
    nginx:1.27-alpine

echo "==> Running certbot"
docker run --rm \
    -v gideon-tasks_letsencrypt:/etc/letsencrypt \
    -v gideon-tasks_certbot_webroot:/var/www/certbot \
    certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "${DOMAIN}"

echo "==> Cleaning up temporary Nginx"
docker stop gideon-certbot-nginx && docker rm gideon-certbot-nginx
rm -f "${TEMP_CONF}"

echo "==> SSL certificate obtained. Starting full stack..."
${COMPOSE} up -d

echo "==> Done! Verify at https://${DOMAIN}/health"
