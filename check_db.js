const { Pool } = require('pg');
const config = require('./config.json');

const pool = new Pool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_NAME,
    port: config.PORT,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkConstraint() {
    try {
        const client = await pool.connect();

        // Vérifier la contrainte
        const constraint = await client.query(`
            SELECT
                conname AS constraint_name,
                pg_get_constraintdef(oid) AS constraint_definition
            FROM pg_constraint
            WHERE conname = 'messages_sender_check'
        `);

        console.log('\n=== Contrainte messages_sender_check ===');
        if (constraint.rows.length > 0) {
            console.log('Définition:', constraint.rows[0].constraint_definition);
        } else {
            console.log('Contrainte non trouvée');
        }

        // Vérifier la structure de la table
        const tableInfo = await client.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'messages'
            ORDER BY ordinal_position
        `);

        console.log('\n=== Structure de la table messages ===');
        tableInfo.rows.forEach(col => {
            console.log(`${col.column_name}: ${col.data_type}${col.character_maximum_length ? '(' + col.character_maximum_length + ')' : ''}`);
        });

        client.release();
        await pool.end();
    } catch (err) {
        console.error('Erreur:', err.message);
        await pool.end();
    }
}

checkConstraint();
