#!/bin/bash
# Script pour vérifier le statut de Mistral sur le serveur ECO

# Charger les variables d'environnement depuis .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo '{"success": false, "message": "Fichier .env non trouvé", "status": "unknown"}'
    exit 1
fi

# Vérifier si Mistral est en cours d'exécution
STATUS=$(sshpass -p "$ECO_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $ECO_USER@$ECO_HOST "pgrep -u \$USER -f 'python.*api_mistral\.py' > /dev/null 2>&1 && echo 'running' || echo 'stopped'" 2>/dev/null)

if [ -z "$STATUS" ]; then
    echo '{"success": false, "message": "Impossible de se connecter au serveur", "status": "unknown"}'
    exit 1
fi

if [ "$STATUS" = "running" ]; then
    echo '{"success": true, "message": "Mistral est en cours d'\''exécution", "status": "running"}'
else
    echo '{"success": true, "message": "Mistral est arrêté", "status": "stopped"}'
fi
