#!/usr/bin/env bash

set -euo pipefail

MASTER_IP="192.168.1.10"
SALT_VERSION="3008.1"
LOG="/tmp/salt-install.log"

RED="\e[31m"
GREEN="\e[32m"
YELLOW="\e[33m"
BLUE="\e[34m"
CYAN="\e[36m"
NC="\e[0m"

banner() {
clear
echo -e "${CYAN}"
cat <<'EOF'

███████╗ █████╗ ██╗  ████████╗
██╔════╝██╔══██╗██║  ╚══██╔══╝
███████╗███████║██║     ██║
╚════██║██╔══██║██║     ██║
███████║██║  ██║███████╗██║
╚══════╝╚═╝  ╚═╝╚══════╝╚═╝

███╗   ███╗██╗███╗   ██╗██╗ ██████╗ ███╗   ██╗
████╗ ████║██║████╗  ██║██║██╔═══██╗████╗  ██║
██╔████╔██║██║██╔██╗ ██║██║██║   ██║██╔██╗ ██║
██║╚██╔╝██║██║██║╚██╗██║██║██║   ██║██║╚██╗██║
██║ ╚═╝ ██║██║██║ ╚████║██║╚██████╔╝██║ ╚████║
╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝

              Salt Minion - 3008 LTS

EOF
echo -e "${NC}"
}

run() {
    local msg="$1"
    shift

    printf "%-55s" "$msg"

    "$@" >"$LOG" 2>&1 &
    pid=$!

    spin='-\|/'

    i=0
    while kill -0 "$pid" 2>/dev/null; do
        i=$(( (i+1) %4 ))
        printf "\r%-55s ${CYAN}%c${NC}" "$msg" "${spin:$i:1}"
        sleep 0.12
    done

    wait "$pid"
    rc=$?

    if [ "$rc" -eq 0 ]; then
        printf "\r%-55s ${GREEN}✔${NC}\n" "$msg"
    else
        printf "\r%-55s ${RED}✖${NC}\n" "$msg"
        cat "$LOG"
        exit 1
    fi
}

banner

echo -e "${BLUE}[+] Starting Salt Minion installation...${NC}"

if [[ $EUID -ne 0 ]]; then
    echo "Run as root"
    exit 1
fi

if dpkg -l | grep -q salt-; then
    run "Stopping salt-minion..." systemctl stop salt-minion || true
    run "Disabling salt-minion..." systemctl disable salt-minion || true

    run "Removing old Salt..." apt-get purge -y \
        salt-minion salt-master salt-common salt-api salt-cloud salt-ssh salt-syndic || true

    run "Cleaning system..." apt-get autoremove -y

    rm -rf /etc/salt
    rm -f /etc/apt/preferences.d/salt-pin-1001
    rm -f /etc/apt/sources.list.d/salt.*

fi

run "Updating packages..." apt-get update
run "Installing dependencies..." apt-get install -y curl gnupg ca-certificates

run "Creating keyring..." mkdir -p /etc/apt/keyrings

run "Adding GPG key..." bash -c \
"curl -fsSL https://packages.broadcom.com/artifactory/api/security/keypair/SaltProjectKey/public | gpg --dearmor > /etc/apt/keyrings/salt-archive-keyring.pgp"

run "Adding repository..." bash -c \
"curl -fsSL https://github.com/saltstack/salt-install-guide/releases/latest/download/salt.sources > /etc/apt/sources.list.d/salt.sources"

cat >/etc/apt/preferences.d/salt-pin-1001 <<EOF
Package: salt-*
Pin: version 3008.*
Pin-Priority: 1001
EOF

run "Refreshing repo..." apt-get update

run "Installing Salt Minion..." apt-get install -y \
salt-common=${SALT_VERSION} \
salt-minion=${SALT_VERSION}

mkdir -p /etc/salt/minion.d

cat >/etc/salt/minion.d/master.conf <<EOF
master: ${MASTER_IP}
id: $(hostname)
EOF

run "Enabling service..." systemctl enable salt-minion
run "Starting service..." systemctl restart salt-minion

echo
echo -e "${GREEN}======================================"
echo " INSTALLATION COMPLETE"
echo "======================================${NC}"
echo "Master  : $MASTER_IP"
echo "Version : $SALT_VERSION"
echo "Host    : $(hostname)"
echo
