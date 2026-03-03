#!/bin/bash
# Script pour arrêter Mistral sur le serveur ECO

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

if [ "$STATUS" = "stopped" ]; then
    echo '{"success": false, "message": "Mistral n'\''est pas en cours d'\''exécution", "status": "stopped"}'
    exit 0
fi

# Arrêter Mistral
sshpass -p "$ECO_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $ECO_USER@$ECO_HOST "pkill -u \$USER -f 'python.*api_mistral\.py'" 2>/dev/null

# Attendre un peu et vérifier le statut
sleep 2
STATUS=$(sshpass -p "$ECO_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $ECO_USER@$ECO_HOST "pgrep -u \$USER -f 'python.*api_mistral\.py' > /dev/null 2>&1 && echo 'running' || echo 'stopped'" 2>/dev/null)

if [ "$STATUS" = "stopped" ]; then
    echo '{"success": true, "message": "Mistral arrêté avec succès", "status": "stopped"}'
else
    echo '{"success": false, "message": "Échec de l'\''arrêt de Mistral", "status": "running"}'
fi
