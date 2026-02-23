#!/usr/bin/env bash
set -e

HOST="app.ruralwm.com"
USER="root"
DIR="/opt/waste-portal"

echo "Deploying to $HOST..."

ssh "$USER@$HOST" "cd $DIR \
  && git config --global --add safe.directory $DIR \
  && sudo -u portal git pull origin main \
  && sudo -u portal npm install \
  && sudo -u portal npm run build \
  && sudo systemctl restart waste-portal \
  && sleep 3 \
  && sudo systemctl is-active waste-portal"

echo "Deploy complete!"
