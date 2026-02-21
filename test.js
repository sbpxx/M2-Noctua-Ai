const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = 8080;
const TEST_EMAIL = `test_${Date.now()}@noctua-test.fr`;
const TEST_PASS = 'TestPassword123';

let ok = 0, fail = 0;

function check(label, passed, info = '') {
    if (passed) {
        ok++;
        console.log(`  \x1b[32m✓\x1b[0m ${label}${info ? '  \x1b[90m(' + info + ')\x1b[0m' : ''}`);
    } else {
        fail++;
        console.log(`  \x1b[31m✗\x1b[0m ${label}${info ? '  \x1b[31m→ ' + info + '\x1b[0m' : ''}`);
    }
}

function req(method, p, body = null, token = null) {
    return new Promise((resolve) => {
        const data = body !== null ? JSON.stringify(body) : null;
        const opts = {
            hostname: 'localhost',
            port: PORT,
            path: p,
            method,
            headers: {
                ...(data && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }),
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            timeout: 5000
        };

        const r = http.request(opts, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(raw); } catch {}
                resolve({ status: res.statusCode, json, raw });
            });
        });

        r.on('error', () => resolve({ status: 0, json: null, raw: '' }));
        r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null, raw: '' }); });
        if (data) r.write(data);
        r.end();
    });
}

async function testDB(config) {
    console.log('\n\x1b[34mBase de données\x1b[0m');

    const pool = new Pool({
        host: config.DB_HOST,
        user: config.DB_USER,
        password: config.DB_PASS,
        database: config.DB_NAME,
        port: config.PORT,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    let client;
    try {
        client = await pool.connect();
        check('Connexion PostgreSQL', true, `${config.DB_HOST}:${config.PORT}`);
    } catch (e) {
        check('Connexion PostgreSQL', false, e.message);
        await pool.end();
        return false;
    }

    for (const t of ['users', 'conversations', 'messages', 'admin_logs']) {
        const r = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)', [t]
        );
        check(`Table "${t}"`, r.rows[0].exists);
    }

    const cols = [
        ['messages', 'note'],
        ['messages', 'sources'],
        ['users', 'archived_conversations'],
        ['users', 'admin'],
        ['users', 'password']
    ];
    for (const [table, col] of cols) {
        const r = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = $1 AND column_name = $2)',
            [table, col]
        );
        check(`Colonne ${table}.${col}`, r.rows[0].exists);
    }

    const count = await client.query('SELECT COUNT(*) FROM users');
    check('Lecture table users', true, `${count.rows[0].count} utilisateur(s)`);

    const unhashed = await client.query(`SELECT COUNT(*) FROM users WHERE password NOT LIKE '$2b$%'`);
    check('Mots de passe tous hashés', unhashed.rows[0].count == 0,
        unhashed.rows[0].count > 0 ? `${unhashed.rows[0].count} non hashé(s)` : '');

    client.release();
    await pool.end();
    return true;
}

async function testRoutes() {
    console.log('\n\x1b[34mRoutes HTTP\x1b[0m');

    for (const p of ['/', '/chat', '/begin']) {
        const r = await req('GET', p);
        check(`GET ${p}`, r.status === 200, r.status ? `${r.status}` : 'injoignable');
    }

    const r404 = await req('GET', '/cette-route-nexiste-pas');
    check('404 sur route inconnue', r404.status === 404, `${r404.status}`);
}

async function testAuth() {
    console.log('\n\x1b[34mAuthentification\x1b[0m');

    const reg = await req('POST', '/register', { nom: 'Test Noctua', email: TEST_EMAIL, mot_de_passe: TEST_PASS });
    check('Inscription', reg.status === 200, reg.json?.error || '');

    const reg2 = await req('POST', '/register', { nom: 'Doublon', email: TEST_EMAIL, mot_de_passe: TEST_PASS });
    check('Refus email déjà utilisé', reg2.status === 400);

    const login = await req('POST', '/login', { email: TEST_EMAIL, password: TEST_PASS });
    check('Connexion', login.status === 200 && !!login.json?.token);
    const token = login.json?.token || null;

    const badLogin = await req('POST', '/login', { email: TEST_EMAIL, password: 'mauvais' });
    check('Refus mauvais mot de passe', badLogin.status === 400);

    const noAuth = await req('GET', `/user?email=${encodeURIComponent(TEST_EMAIL)}`);
    check('GET /user sans token → 401', noAuth.status === 401);

    if (token) {
        const userInfo = await req('GET', `/user?email=${encodeURIComponent(TEST_EMAIL)}`, null, token);
        check('GET /user avec token', userInfo.status === 200 && !!userInfo.json?.id);
    }

    return token;
}

async function testConversations(token) {
    console.log('\n\x1b[34mConversations\x1b[0m');

    let convId = null;

    if (token) {
        const userInfo = await req('GET', `/user?email=${encodeURIComponent(TEST_EMAIL)}`, null, token);
        const userId = userInfo.json?.id;

        const create = await req('POST', '/conversations', { user_id: userId, first_message: 'Ceci est un message de test' });
        check('Création conversation', create.status === 200 && !!create.json?.id);
        convId = create.json?.id || null;

        // Message vide → 400
        const noMsg = await req('POST', '/conversations', { user_id: userId, first_message: '   ' });
        check('Refus message vide à la création', noMsg.status === 400);

        const list = await req('GET', `/conversations/user/${userId}`, null, token);
        check('Liste des conversations', list.status === 200 && Array.isArray(list.json));

        const listNoAuth = await req('GET', `/conversations/user/${userId}`);
        check('Liste conversations sans token → 401', listNoAuth.status === 401);

        if (convId) {
            const msgs = await req('GET', `/conversations/${convId}/messages`, null, token);
            check('Récupération des messages', msgs.status === 200 && Array.isArray(msgs.json));

            const rename = await req('PATCH', `/conversations/${convId}/title`, { title: 'Titre modifié' }, token);
            check('Renommage titre', rename.status === 200 && rename.json?.title === 'Titre modifié');

            // Titre vide → 400
            const emptyTitle = await req('PATCH', `/conversations/${convId}/title`, { title: '' }, token);
            check('Refus titre vide', emptyTitle.status === 400);

            // Renommer sans token → 401
            const renameNoAuth = await req('PATCH', `/conversations/${convId}/title`, { title: 'X' });
            check('Renommage sans token → 401', renameNoAuth.status === 401);

            const archive = await req('POST', `/conversations/${convId}/archive`, null, token);
            check('Archivage', archive.status === 200);

            // Archiver sans token → 401
            const archiveNoAuth = await req('POST', `/conversations/${convId}/archive`);
            check('Archivage sans token → 401', archiveNoAuth.status === 401);

            const archives = await req('GET', '/api/user/archived-conversations', null, token);
            check('Conversation dans les archives', Array.isArray(archives.json) && archives.json.some(c => c.id === convId));

            // Archives sans token → 401
            const archivesNoAuth = await req('GET', '/api/user/archived-conversations');
            check('Archives sans token → 401', archivesNoAuth.status === 401);

            const unarchive = await req('DELETE', `/conversations/${convId}/archive`, null, token);
            check('Désarchivage', unarchive.status === 200);

            const archivesAfter = await req('GET', '/api/user/archived-conversations', null, token);
            check('Plus dans les archives après désarchivage', Array.isArray(archivesAfter.json) && !archivesAfter.json.some(c => c.id === convId));

            // Suppression individuelle
            const del = await req('DELETE', `/conversations/${convId}`, null, token);
            check('Suppression conversation', del.status === 200);

            // Vérifier qu'elle n'existe plus
            const afterDel = await req('GET', `/conversations/${convId}/messages`, null, token);
            check('Conversation supprimée inaccessible', afterDel.status === 404 || afterDel.status === 403);

            convId = null; // plus dispo pour testMessages
        }
    }

    // Invité
    const guestConv = await req('POST', '/conversations', { user_id: null, first_message: 'Message invité' });
    check('Création conversation invité (sans compte)', guestConv.status === 200 && !!guestConv.json?.id);

    if (guestConv.json?.id) {
        const guestMsgs = await req('GET', `/conversations/${guestConv.json.id}/messages`);
        check('Messages conversation invité accessibles sans token', guestMsgs.status === 200);

        // Un utilisateur connecté ne peut pas accéder à une conv invité
        if (token) {
            const authOnGuest = await req('GET', `/conversations/${guestConv.json.id}/messages`, null, token);
            check('Conv invité inaccessible avec token → 403', authOnGuest.status === 403);
        }
    }

    return convId;
}

async function testAccessControl(token) {
    if (!token) return;
    console.log('\n\x1b[34mContrôle d\'accès\x1b[0m');

    // Créer un second utilisateur
    const email2 = `test2_${Date.now()}@noctua-test.fr`;
    await req('POST', '/register', { nom: 'Test2', email: email2, mot_de_passe: TEST_PASS });
    const login2 = await req('POST', '/login', { email: email2, password: TEST_PASS });
    const token2 = login2.json?.token;

    if (!token2) { check('Second compte de test créé', false); return; }
    check('Second compte de test créé', true);

    const u2Info = await req('GET', `/user?email=${encodeURIComponent(email2)}`, null, token2);
    const u2Id = u2Info.json?.id;

    // user1 essaie d'accéder aux convs de user2
    const crossList = await req('GET', `/conversations/user/${u2Id}`, null, token);
    check('Accès aux convs d\'un autre utilisateur → 403', crossList.status === 403);

    // Créer une conv pour user2, user1 essaie de lire ses messages
    const u1Info = await req('GET', `/user?email=${encodeURIComponent(TEST_EMAIL)}`, null, token);
    const conv2 = await req('POST', '/conversations', { user_id: u2Id, first_message: 'Privé user2' });
    if (conv2.json?.id) {
        const crossMsgs = await req('GET', `/conversations/${conv2.json.id}/messages`, null, token);
        check('Accès aux messages d\'un autre utilisateur → 403', crossMsgs.status === 403);

        // Nettoyage conv user2
        await req('DELETE', `/conversations/${conv2.json.id}`, null, token2);
    }

    // Nettoyage user2 (suppr ses convs)
    await req('DELETE', '/api/user/conversations/all', null, token2);
}

async function testAdminRoutes(token) {
    if (!token) return;
    console.log('\n\x1b[34mRoutes admin (accès non-admin)\x1b[0m');

    // Un utilisateur normal doit recevoir 403 sur toutes les routes admin
    const routes = [
        ['GET', '/api/admin/users'],
        ['GET', '/api/admin/logs'],
        ['GET', '/api/admin/mistral/status'],
        ['POST', '/api/admin/mistral/start'],
        ['POST', '/api/admin/mistral/stop'],
    ];

    for (const [method, path] of routes) {
        const r = await req(method, path, null, token);
        check(`${method} ${path} sans droits admin → 403`, r.status === 403);
    }
}

async function testMessages(token, convId) {
    if (!token || !convId) return;
    console.log('\n\x1b[34mVotes (note)\x1b[0m');

    const msgs = await req('GET', `/conversations/${convId}/messages`, null, token);
    const msg = msgs.json?.[0];
    if (!msg) { check('Message disponible pour voter', false, 'aucun message'); return; }

    const up = await req('PATCH', `/messages/${msg.id}/note`, { note: 1 }, token);
    check('Upvote', up.status === 200 && up.json?.note === 1);

    const down = await req('PATCH', `/messages/${msg.id}/note`, { note: -1 }, token);
    check('Downvote', down.status === 200 && down.json?.note === -1);

    const unvote = await req('PATCH', `/messages/${msg.id}/note`, { note: null }, token);
    check('Annulation vote', unvote.status === 200 && unvote.json?.note === null);

    const invalid = await req('PATCH', `/messages/${msg.id}/note`, { note: 99 }, token);
    check('Refus note invalide (99)', invalid.status === 400);

    const noAuth = await req('PATCH', `/messages/${msg.id}/note`, { note: 1 });
    check('Vote sans token → 401', noAuth.status === 401);
}

async function testUserFeatures(token) {
    if (!token) return;
    console.log('\n\x1b[34mFonctionnalités compte\x1b[0m');

    const exp = await req('GET', '/api/user/export-data', null, token);
    check('Export données', exp.status === 200 && !!exp.json?.user && Array.isArray(exp.json?.conversations));

    const expNoAuth = await req('GET', '/api/user/export-data');
    check('Export sans token → 401', expNoAuth.status === 401);

    const changePw = await req('POST', '/change-password', {
        email: TEST_EMAIL,
        oldPassword: TEST_PASS,
        newPassword: 'NouveauMDP456!'
    }, token);
    check('Changement mot de passe', changePw.status === 200);

    const relogin = await req('POST', '/login', { email: TEST_EMAIL, password: 'NouveauMDP456!' });
    check('Connexion avec le nouveau mot de passe', relogin.status === 200 && !!relogin.json?.token);

    // Mauvais ancien mdp
    const badChange = await req('POST', '/change-password', {
        email: TEST_EMAIL,
        oldPassword: 'mauvais',
        newPassword: 'xyz'
    }, token);
    check('Refus changement avec mauvais ancien mdp', badChange.status === 400);
}

async function cleanup(token) {
    if (!token) return;
    await req('DELETE', '/api/user/conversations/all', null, token);
}

async function main() {
    console.log('\x1b[36mNoctua AI — tests\x1b[0m');

    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.log('\x1b[31mconfig.json introuvable\x1b[0m');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    await testDB(config);

    const serverCheck = await req('GET', '/');
    if (!serverCheck.status) {
        console.log(`\n\x1b[31mServeur inaccessible sur le port ${PORT} — lancez node index.js\x1b[0m`);
    } else {
        await testRoutes();
        const token = await testAuth();
        const convId = await testConversations(token);
        await testAccessControl(token);
        await testAdminRoutes(token);
        await testMessages(token, convId);
        await testUserFeatures(token);
        await cleanup(token);
    }

    const total = ok + fail;
    const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
    const col = pct >= 80 ? '\x1b[32m' : pct >= 50 ? '\x1b[33m' : '\x1b[31m';
    console.log(`\n  ${ok}/${total} ${col}(${pct}%)\x1b[0m\n`);
}

main().catch(e => {
    console.error('Erreur:', e.message);
    process.exit(1);
});
