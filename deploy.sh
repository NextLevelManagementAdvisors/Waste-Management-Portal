#!/usr/bin/env bash
set -ex

HOST="app.ruralwm.com"
USER="root"
DIR="/opt/waste-portal" # The application directory on the remote server
APP_USER="portal"       # The dedicated user for the application

echo "🚀 Deploying to $HOST..."

# Copy the systemd service file to a temporary location
scp deploy/waste-portal.service "$USER@$HOST":/tmp/waste-portal.service

# Using a heredoc for the remote script for better readability and maintainability.
ssh "$USER@$HOST" /bin/bash << EOF
  set -ex
  
  echo "--- Moving new service file into place ---"
  sudo mv /tmp/waste-portal.service /etc/systemd/system/waste-portal.service

  echo "--- Reloading systemd daemon ---"
  sudo systemctl daemon-reload

  cd "$DIR"

  echo "--- Pulling latest changes from main branch ---"
  sudo -u "$APP_USER" git pull origin main
  
  echo "--- Installing dependencies with 'npm ci' for a clean, fast build ---"
  sudo -u "$APP_USER" npm ci
  
  echo "--- Building the application ---"
  # Explicitly removing the old build directory as the app user is safer.
  sudo -u "$APP_USER" rm -rf dist
  sudo -u "$APP_USER" npm run build
  
  echo "--- Restarting the application service ---"
  sudo systemctl restart waste-portal
  
  echo "--- Verifying service status ---"
  sleep 3 # Give the service a moment to start up.
  if sudo systemctl is-active --quiet waste-portal; then
      echo "Service is active."
  else
      echo "🔴 Service failed to start. Check logs with: sudo journalctl -u waste-portal -n 50"
      exit 1
  fi
EOF

echo "✅ Deploy complete!"
