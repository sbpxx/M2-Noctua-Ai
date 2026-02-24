// libraryBDD.js
// Crée et exporte le pool de connexions PostgreSQL utilisé par toute l'application.
// On utilise un pool plutôt qu'une connexion unique pour gérer plusieurs requêtes en parallèle.

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const pool = new Pool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_NAME,
    port: config.PORT,
    ssl: {
        rejectUnauthorized: false  // SSL auto-signé
    },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    max: 10
});

module.exports = pool;
