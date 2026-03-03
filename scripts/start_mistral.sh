#!/bin/bash
# Script pour démarrer Mistral sur le serveur ECO

# Charger les variables d'environnement depuis .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo '{"success": false, "message": "Fichier .env non trouvé", "status": "unknown"}'
    exit 1
fi

# Vérifier si Mistral est déjà en cours d'exécution
STATUS=$(sshpass -p "$ECO_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $ECO_USER@$ECO_HOST "pgrep -u \$USER -f 'python.*api_mistral\.py' > /dev/null 2>&1 && echo 'running' || echo 'stopped'" 2>/dev/null)

if [ "$STATUS" = "running" ]; then
    echo '{"success": false, "message": "Mistral est déjà en cours d'\''exécution", "status": "running"}'
    exit 0
fi

# Démarrer Mistral en arrière-plan
sshpass -p "$ECO_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $ECO_USER@$ECO_HOST "cd ~/projet && source venv/bin/activate && nohup python api_mistral.py > ~/mistral.log 2>&1 &" 2>/dev/null

# Attendre que le processus soit détectable
sleep 8

# Vérifier si le processus existe
STATUS=$(sshpass -p "$ECO_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $ECO_USER@$ECO_HOST "pgrep -u \$USER -f 'python.*api_mistral\.py' > /dev/null 2>&1 && echo 'running' || echo 'stopped'" 2>/dev/null)

if [ "$STATUS" = "running" ]; then
    echo '{"success": true, "message": "Mistral démarré avec succès", "status": "running"}'
else
    echo '{"success": false, "message": "Échec du démarrage de Mistral", "status": "stopped"}'
fi
