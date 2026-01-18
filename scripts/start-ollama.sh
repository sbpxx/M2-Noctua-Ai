#!/bin/bash
set -e

echo "Starting Ollama server..."

# Start Ollama server 
ollama serve &

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
sleep 5

# Pull llama3.2 model if not already present
if ! ollama list | grep -q "llama3.2"; then
    echo "Pulling llama3.2 model (this may take several minutes)..."
    ollama pull llama3.2
    echo "Model llama3.2 pulled successfully"
else
    echo "Model llama3.2 already available"
fi

echo "Ollama is ready!"

# Keep container running
wait
