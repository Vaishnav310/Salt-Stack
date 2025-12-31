
 # SaltStack Installation and Setup (Debian/Ubuntu)

This guide covers installing SaltStack components using the official Salt Project repositories, enabling services, and basic key management.


## Prerequisites

Ensure the system has `curl` installed and that you have `sudo` privileges.

---

## Add Salt Project Repository

### 1. Ensure the keyrings directory exists

```bash
sudo mkdir -p /etc/apt/keyrings
````

### 2. Download the Salt Project public key

```bash
curl -fsSL https://packages.broadcom.com/artifactory/api/security/keypair/SaltProjectKey/public \
  | sudo tee /etc/apt/keyrings/salt-archive-keyring.pgp
```

### 3. Configure the APT repository

```bash
curl -fsSL https://github.com/saltstack/salt-install-guide/releases/latest/download/salt.sources \
  | sudo tee /etc/apt/sources.list.d/salt.sources
```

### 4. Update package lists

```bash
sudo apt-get update
```

---

## Available SaltStack Packages

Install only the components you need:

```bash
sudo apt-get install salt-master
sudo apt-get install salt-minion
sudo apt-get install salt-ssh
sudo apt-get install salt-syndic
sudo apt-get install salt-cloud
sudo apt-get install salt-api
```

---

## Enable and Start Salt Services

### Salt Master

```bash
sudo systemctl enable salt-master
sudo systemctl start salt-master
```

### Salt Minion

```bash
sudo systemctl enable salt-minion
sudo systemctl start salt-minion
```

### Salt Syndic

```bash
sudo systemctl enable salt-syndic
sudo systemctl start salt-syndic
```

### Salt API

```bash
sudo systemctl enable salt-api
sudo systemctl start salt-api
```

---

## Minion Key Management

### List all minion keys

```bash
sudo salt-key --list all
```

or

```bash
sudo salt-key -L
```

### Accept a specific minion

```bash
sudo salt-key --accept imsadmin
```

or

```bash
sudo salt-key -a minion-id
```

### Accept all pending minions

```bash
sudo salt-key -A
```

---

## Core Salt Concepts

* **Grains**
  Static data used to tag servers by role (e.g., `web`, `db`, `monitoring`).

* **Pillars**
  Secure storage for credentials and environment-specific configuration.

* **Mine**
  Publish and query service discovery data between minions.

* **Beacons**
  Monitor critical files, services, and system states.

* **Reactors**
  Automatically respond to events and remediate unauthorized changes.

---
