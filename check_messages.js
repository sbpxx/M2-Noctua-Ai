const { Pool } = require('pg');
const config = require('./config.json');

const pool = new Pool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_NAME,
    port: config.PORT,
    ssl: { rejectUnauthorized: false }
});

async function checkMessages() {
    const client = await pool.connect();

    // Vérifier la conversation 32
    const conv = await client.query('SELECT * FROM conversations WHERE id = 32');
    console.log('\n=== Conversation 32 ===');
    console.log(conv.rows[0] || 'Pas de conversation 32');

    // Vérifier les messages de la conversation 32
    const msgs = await client.query('SELECT * FROM messages WHERE conversation_id = 32 ORDER BY created_at ASC');
    console.log('\n=== Messages de la conversation 32 ===');
    if (msgs.rows.length === 0) {
        console.log('Aucun message');
    } else {
        msgs.rows.forEach(msg => {
            console.log(`[${msg.sender}] ${msg.content.substring(0, 50)}...`);
        });
    }

    client.release();
    await pool.end();
}

checkMessages();
