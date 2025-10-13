const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Lire le fichier de configuration
const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Créer un pool de connexions à la base de données PostgreSQL
const pool = new Pool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_NAME,
    port: config.PORT,
    ssl: {
        rejectUnauthorized: false // Accepter les connexions SSL non autorisées
    },
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 5000,
    max: 10
});

// Exporter le pool de connexions
module.exports = pool;