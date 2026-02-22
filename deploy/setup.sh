#!/bin/bash
# One-time VPS setup for Waste Management Portal
# Run as root: bash /tmp/setup.sh
set -e

REPO_URL="https://github.com/NextLevelManagementAdvisors/Waste-Management-Portal.git"
APP_DIR="/opt/waste-portal"
APP_USER="portal"
DB_NAME="waste_management"
DB_USER="portal"
DOMAIN="app.ruralwm.com"

echo "=== Waste Management Portal - VPS Setup ==="

# -----------------------------------------------
# 1. Install Node.js 20.x
# -----------------------------------------------
if ! command -v node &> /dev/null; then
    echo "[1/8] Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[1/8] Node.js already installed: $(node -v)"
fi

# -----------------------------------------------
# 2. Install PostgreSQL
# -----------------------------------------------
if ! command -v psql &> /dev/null; then
    echo "[2/8] Installing PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
else
    echo "[2/8] PostgreSQL already installed: $(psql --version)"
fi

# -----------------------------------------------
# 3. Create Linux user
# -----------------------------------------------
if ! id "$APP_USER" &> /dev/null; then
    echo "[3/8] Creating system user '$APP_USER'..."
    useradd --system --shell /bin/bash --home "$APP_DIR" "$APP_USER"
else
    echo "[3/8] User '$APP_USER' already exists"
fi

# -----------------------------------------------
# 4. Create PostgreSQL database + user
# -----------------------------------------------
echo "[4/8] Setting up PostgreSQL database..."
DB_PASSWORD=$(openssl rand -hex 32)

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo ">>> SAVE THIS DATABASE_URL - you'll need it for the .env file <<<"
echo ""

# -----------------------------------------------
# 5. Clone repository
# -----------------------------------------------
if [ ! -d "$APP_DIR" ]; then
    echo "[5/8] Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
else
    echo "[5/8] App directory already exists at $APP_DIR"
fi

# -----------------------------------------------
# 6. Install dependencies and build
# -----------------------------------------------
echo "[6/8] Installing npm dependencies and building..."
cd "$APP_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build

# -----------------------------------------------
# 7. Install systemd service
# -----------------------------------------------
echo "[7/8] Setting up systemd service..."
cp "$APP_DIR/deploy/waste-portal.service" /etc/systemd/system/waste-portal.service
systemctl daemon-reload
systemctl enable waste-portal
echo "Service installed (not started yet - create .env first)"

# -----------------------------------------------
# 8. Install Nginx config + SSL
# -----------------------------------------------
echo "[8/8] Setting up Nginx..."
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
    systemctl enable nginx
fi

cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx

# Install Certbot for SSL
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
fi

echo ""
echo "============================================"
echo "  Setup complete! Next steps:"
echo "============================================"
echo ""
echo "1. Create the .env file:"
echo "   nano $APP_DIR/.env"
echo ""
echo "   Required variables:"
echo "   DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo "   SESSION_SECRET=$(openssl rand -hex 32)"
echo "   ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "   APP_DOMAIN=https://$DOMAIN"
echo "   ALLOWED_ORIGINS=https://$DOMAIN"
echo "   ADMIN_EMAIL=admin@yourdomain.com"
echo "   ADMIN_PASSWORD=your-secure-password"
echo "   STRIPE_SECRET_KEY=sk_live_..."
echo "   STRIPE_PUBLISHABLE_KEY=pk_live_..."
echo "   GOOGLE_OAUTH_CLIENT_ID=..."
echo "   GOOGLE_OAUTH_CLIENT_SECRET=..."
echo "   GOOGLE_MAPS_API_KEY=..."
echo "   (plus TWILIO, GMAIL, OPTIMOROUTE keys)"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start waste-portal"
echo "   sudo systemctl status waste-portal"
echo ""
echo "3. Set up SSL:"
echo "   sudo certbot --nginx -d $DOMAIN"
echo ""
echo "4. Point DNS A record for $DOMAIN to this server's IP"
echo ""
echo "5. Test: curl https://$DOMAIN"
echo "============================================"
