#!/usr/bin/env bash
# Prepare a fresh Ubuntu EC2 instance to run LearnHub.
#
# Use it as the instance's "User data" when you launch it, or run it once over SSH:
#   sudo bash ec2-setup.sh
# It is safe to run more than once.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
ENV_DIR=/etc/learnhub
ENV_FILE="$ENV_DIR/learnhub.env"
export DEBIAN_FRONTEND=noninteractive

echo "==> Installing Docker"
apt-get update -y
apt-get install -y docker.io curl openssl
systemctl enable --now docker

# Let the SSH user run docker without sudo (Jenkins deploys as this user).
if id "$DEPLOY_USER" >/dev/null 2>&1; then
  usermod -aG docker "$DEPLOY_USER"
fi

echo "==> Creating $ENV_FILE"
install -d -m 750 -o root -g docker "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  # A random Flask secret key, generated on the server so it never passes through Jenkins or Git.
  ( umask 027; printf 'SECRET_KEY=%s\n' "$(openssl rand -hex 32)" > "$ENV_FILE" )
fi
chown root:docker "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "==> Creating the data volume for the SQLite database"
docker volume create learnhub-data >/dev/null

# Small instances (t2.micro / t3.micro, 1 GB RAM) can run out of memory while
# pulling images; 1 GB of swap avoids that.
if [ ! -f /swapfile ]; then
  echo "==> Adding 1 GB swap"
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Done. Docker $(docker --version | awk '{print $3}' | tr -d ,) is ready."
echo "    Log out and back in once so '$DEPLOY_USER' picks up the docker group."
