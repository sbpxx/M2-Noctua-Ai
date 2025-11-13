const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Couleurs pour le terminal
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Compteurs de tests
let testsTotal = 0;
let testsReussis = 0;
let testsEchoues = 0;

// Fonction utilitaire pour afficher les résultats
function logTest(nom, reussi, message = '') {
    testsTotal++;
    if (reussi) {
        testsReussis++;
        console.log(`${colors.green}✓${colors.reset} ${nom}`);
        if (message) console.log(`  ${colors.cyan}→${colors.reset} ${message}`);
    } else {
        testsEchoues++;
        console.log(`${colors.red}✗${colors.reset} ${nom}`);
        if (message) console.log(`  ${colors.red}→${colors.reset} ${message}`);
    }
}

// Fonction pour lire la configuration
function lireConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        logTest('Lecture du fichier config.json', true, `Base de données: ${config.DB_NAME}`);
        return config;
    } catch (err) {
        logTest('Lecture du fichier config.json', false, err.message);
        return null;
    }
}

// Test de connexion à la base de données
async function testerConnexionBD(config) {
    console.log(`\n${colors.blue}═══ Test de connexion à la base de données ═══${colors.reset}`);

    const pool = new Pool({
        host: config.DB_HOST,
        user: config.DB_USER,
        password: config.DB_PASS,
        database: config.DB_NAME,
        port: config.PORT,
        ssl: {
            rejectUnauthorized: false
        },
        connectionTimeoutMillis: 5000
    });

    try {
        const client = await pool.connect();
        logTest('Connexion à PostgreSQL', true, `Hôte: ${config.DB_HOST}:${config.PORT}`);

        // Test de requête simple
        try {
            const result = await client.query('SELECT NOW()');
            logTest('Exécution d\'une requête SQL', true, `Date serveur: ${result.rows[0].now}`);
        } catch (err) {
            logTest('Exécution d\'une requête SQL', false, err.message);
        }

        // Vérifier l'existence de la table utilisateur
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'user'
                );
            `);
            logTest('Vérification de la table "utilisateur"', tableCheck.rows[0].exists,
                    tableCheck.rows[0].exists ? 'Table trouvée' : 'Table non trouvée');

            if (tableCheck.rows[0].exists) {
                // Compter les utilisateurs
                const countResult = await client.query('SELECT COUNT(*) FROM user');
                logTest('Requête sur la table user', true,
                        `Nombre d'utilisateurs: ${countResult.rows[0].count}`);
            }
        } catch (err) {
            logTest('Vérification de la table "utilisateur"', false, err.message);
        }

        client.release();
        await pool.end();
        return true;
    } catch (err) {
        logTest('Connexion à PostgreSQL', false, err.message);
        await pool.end();
        return false;
    }
}

// Test du serveur HTTP
function testerServeur(port = 8080) {
    console.log(`\n${colors.blue}═══ Test du serveur HTTP ═══${colors.reset}`);

    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: '/',
            method: 'GET',
            timeout: 3000
        };

        const req = http.request(options, (res) => {
            logTest(`Serveur accessible sur le port ${port}`, true, `Status: ${res.statusCode}`);

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                logTest('Réponse du serveur reçue', true, `Taille: ${data.length} octets`);
                resolve(true);
            });
        });

        req.on('error', (err) => {
            logTest(`Serveur accessible sur le port ${port}`, false, err.message);
            logTest('Conseil', false,
                    'Le serveur n\'est peut-être pas démarré. Lancez-le avec: node index.js');
            resolve(false);
        });

        req.on('timeout', () => {
            logTest(`Serveur accessible sur le port ${port}`, false, 'Timeout de connexion');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// Test des routes principales
async function testerRoutes(port = 8080) {
    console.log(`\n${colors.blue}═══ Test des routes principales ═══${colors.reset}`);

    const routes = [
        { path: '/', nom: 'Page d\'accueil (/)' },
        { path: '/chat', nom: 'Page chat (/chat)' },
        { path: '/begin', nom: 'Page begin (/begin)' }
    ];

    for (const route of routes) {
        await new Promise((resolve) => {
            const options = {
                hostname: 'localhost',
                port: port,
                path: route.path,
                method: 'GET',
                timeout: 2000
            };

            const req = http.request(options, (res) => {
                logTest(route.nom, res.statusCode === 200, `Status: ${res.statusCode}`);
                res.on('data', () => {}); 
                res.on('end', resolve);
            });

            req.on('error', (err) => {
                logTest(route.nom, false, err.message);
                resolve();
            });

            req.on('timeout', () => {
                logTest(route.nom, false, 'Timeout');
                req.destroy();
                resolve();
            });

            req.end();
        });
    }
}

 



// Fonction principale
async function executerTests() {
    console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║     TESTS DE FONCTIONNEMENT - NOCTUA AI               ║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

    console.log(`${colors.blue}═══ Test de configuration ═══${colors.reset}`);
    const config = lireConfig();

    if (!config) {
        console.log(`\n${colors.red}Tests interrompus - Fichier de configuration manquant${colors.reset}`);
        afficherResume();
        return;
    }

    // Test de connexion à la base de données
    const bdOk = await testerConnexionBD(config);

    // Test du serveur
    const serveurOk = await testerServeur(8080);

    if (serveurOk) {
        // Test des routes
        await testerRoutes(8080);

        // Test de l'API (seulement si la BD fonctionne)

    }

    afficherResume();
}

// Afficher le résumé des tests
function afficherResume() {
    console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║                  RÉSUMÉ DES TESTS                     ║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

    console.log(`  Total de tests:    ${colors.blue}${testsTotal}${colors.reset}`);
    console.log(`  Tests réussis:     ${colors.green}${testsReussis}${colors.reset}`);
    console.log(`  Tests échoués:     ${colors.red}${testsEchoues}${colors.reset}`);

    const pourcentage = testsTotal > 0 ? Math.round((testsReussis / testsTotal) * 100) : 0;
    const couleurPourcentage = pourcentage >= 80 ? colors.green :
                                pourcentage >= 50 ? colors.yellow : colors.red;

    console.log(`  Taux de réussite:  ${couleurPourcentage}${pourcentage}%${colors.reset}\n`);

    if (testsEchoues === 0) {
        console.log(`${colors.green}✓ Tous les tests sont passés avec succès !${colors.reset}\n`);
    } else {
        console.log(`${colors.yellow}Certains tests ont échoué. Vérifiez les détails ci-dessus.${colors.reset}\n`);
    }
}

// Lancer les tests
executerTests().catch(err => {
    console.error(`${colors.red}Erreur fatale lors de l'exécution des tests:${colors.reset}`, err);
    process.exit(1);
});
