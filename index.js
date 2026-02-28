// index.js
// Serveur principal de Noctua AI.
// Gère toutes les routes HTTP, la communication temps-réel Socket.io
// et la connexion avec l'API RAG.

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { exec } = require('child_process');
const pool = require('./js/libraryBDD');

const app = express();
const PORT = 8080;
const BCRYPT_ROUNDS = 10;
const scriptsPath = path.join(__dirname, 'scripts');
const RAG_API_URL = process.env.RAG_API_URL || 'http://127.0.0.1:5000/api/chat';
const RAG_MODEL = 'rag-mistral';

const secretKey = process.env.JWT_SECRET;
if (!secretKey) {
    console.error('JWT_SECRET non défini dans .env — arrêt du serveur');
    process.exit(1);
}

// ====== FONCTIONS UTILITAIRES ======

// Génère un titre de conversation à partir du premier message utilisateur
// en gardant les 4 mots les plus significatifs
function generateTitle(message) {
    const stopWords = new Set([
        'le','la','les','un','une','des','du','de','d','l',
        'je','tu','il','elle','on','nous','vous','ils','elles',
        'est','sont','a','ont','été','être','avoir',
        'que','qui','quoi','dont','où','quand','comment','pourquoi','quel','quelle',
        'ce','se','sa','son','ses','mon','ma','mes','ton','ta','tes',
        'et','ou','mais','donc','or','ni','car','si','en','au','aux',
        'pas','plus','très','bien','faire','fais','peut','peux','veux','vais',
        'me','te','lui','y','ça','cela','ceci','tout','tous'
    ]);

    return message
        .toLowerCase()
        .replace(/[^a-zàâäéèêëîïôùûüç\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
        .slice(0, 4)
        .map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
        .join(' ') || message.substring(0, 40);
}

// Enregistre une action admin dans la table admin_logs avec l'email de l'admin
async function logAdminAction(userId, action) {
    let client;
    try {
        client = await pool.connect();
        const userResult = await client.query('SELECT email FROM "users" WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
            const userEmail = userResult.rows[0].email;
            await client.query('INSERT INTO admin_logs (user_email, action) VALUES ($1, $2)', [userEmail, action]);
            console.log(`[LOG ADMIN] ${userEmail} : ${action}`);
        }
    } catch (err) {
        console.error('Erreur enregistrement log admin:', err.message);
    } finally {
        if (client) client.release();
    }
}

// ====== MIDDLEWARES ======

// Vérifie que le header Authorization contient un JWT valide
// Utilisé sur toutes les routes qui nécessitent d'être connecté
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Accès refusé' });

    jwt.verify(token, secretKey, (err, user) => {
        if (err) return res.status(403).json({ error: 'Jeton invalide ou expiré' });
        req.user = user;
        next();
    });
}

// Version optionnelle : si un token est présent on le valide, sinon req.user = null
// Utilisé sur les routes accessibles aux invités ET aux utilisateurs connectés
function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) { req.user = null; return next(); }
    jwt.verify(token, secretKey, (err, user) => {
        req.user = err ? null : user;
        next();
    });
}

// Vérifie le header X-API-Key et attache req.apiKey si valide
async function authenticateApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json({ error: 'Clé API manquante' });

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM api_keys WHERE key = $1',
            [key]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'Clé API invalide' });
        req.apiKey = result.rows[0];
        next();
    } catch (err) {
        console.error('Erreur vérification clé API:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
}

// Vérifie que l'utilisateur connecté est admin
async function isAdmin(req, res, next) {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT admin FROM "users" WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0 || !result.rows[0].admin) {
            return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
        }
        next();
    } catch (err) {
        console.error('Erreur vérification admin:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
}

// ====== CONFIGURATION EXPRESS ======

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// En développement on désactive le cache pour que les modifs CSS/JS soient visibles immédiatement
const isDev = process.env.NODE_ENV !== 'production';
app.use(express.static('.', isDev ? {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => { res.set('Cache-Control', 'no-store'); }
} : {}));
app.use(express.json());

// ====== ROUTES — PAGES ======

// Évite un 404 dans la console du navigateur pour la favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => res.render('accueil'));
app.get('/chat', (req, res) => res.render('chat'));
app.get('/begin', (req, res) => res.render('begin'));

// ====== ROUTES — AUTHENTIFICATION ======

app.post('/register', async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        const emailCheck = await client.query(
            'SELECT * FROM "users" WHERE email = $1',
            [req.body.email]
        );
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Adresse e-mail déjà utilisée' });
        }

        const hashedPassword = await bcrypt.hash(req.body.mot_de_passe, BCRYPT_ROUNDS);
        const result = await client.query(
            'INSERT INTO "users" (name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [req.body.nom, req.body.email, hashedPassword]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur lors de l\'ajout de l\'utilisateur:', err.stack);
        res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'utilisateur' });
    } finally {
        if (client) client.release();
    }
});

app.post('/login', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM "users" WHERE email = $1',
            [req.body.email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Utilisateur non trouvé' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(req.body.password, user.password);

        if (passwordMatch) {
            // Le token expire dans 1h, le frontend le stocke en sessionStorage
            const token = jwt.sign({ id: user.id }, secretKey, { expiresIn: '1h' });
            return res.status(200).json({ token });
        } else {
            return res.status(400).json({ error: 'Mot de passe incorrect' });
        }
    } catch (err) {
        console.error('Erreur lors de la connexion:', err.stack);
        res.status(500).json({ error: 'Erreur lors de la connexion' });
    } finally {
        if (client) client.release();
    }
});

// Récupérer les informations publiques de l'utilisateur
app.get('/user', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT id, name, email, admin FROM "users" WHERE email = $1',
            [req.query.email]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur lors de la récupération des informations de l\'utilisateur:', err.stack);
        res.status(500).json({ error: 'Erreur lors de la récupération des informations de l\'utilisateur' });
    } finally {
        if (client) client.release();
    }
});

// Route utilisée par le frontend pour vérifier si le token est encore valide
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Accès autorisé', user: req.user });
});

app.post('/change-password', authenticateToken, async (req, res) => {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    let client;
    try {
        client = await pool.connect();
        const userCheck = await client.query('SELECT * FROM "users" WHERE email = $1', [email]);

        if (userCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Utilisateur non trouvé' });
        }

        const passwordMatch = await bcrypt.compare(oldPassword, userCheck.rows[0].password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
        }

        const hashedNew = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await client.query('UPDATE "users" SET password = $1 WHERE email = $2', [hashedNew, email]);
        res.json({ message: 'Mot de passe modifié avec succès' });
    } catch (err) {
        console.error('Erreur lors du changement de mot de passe:', err.stack);
        res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTES — COMPTE UTILISATEUR ======

app.patch('/user/name', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });

    let client;
    try {
        client = await pool.connect();
        await client.query('UPDATE "users" SET name = $1 WHERE id = $2', [name.trim(), req.user.id]);
        res.json({ success: true, name: name.trim() });
    } catch (err) {
        console.error('Erreur modification nom:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Exporte toutes les conversations et messages de l'utilisateur en JSON
app.get('/api/user/export-data', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const userResult = await client.query(
            'SELECT id, name, email FROM "users" WHERE id = $1', [req.user.id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        const user = userResult.rows[0];
        const conversationsResult = await client.query(
            'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY created_at ASC',
            [req.user.id]
        );

        const conversations = [];
        let totalMessages = 0;

        for (const conv of conversationsResult.rows) {
            const messagesResult = await client.query(
                'SELECT sender, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
                [conv.id]
            );

            const messages = messagesResult.rows.map(msg => {
                let sources = null;
                if (msg.sources) {
                    if (typeof msg.sources === 'object') {
                        sources = msg.sources;
                    } else if (typeof msg.sources === 'string' && msg.sources.trim()) {
                        try { sources = JSON.parse(msg.sources); } catch { sources = null; }
                    }
                }
                return { sender: msg.sender, content: msg.content, sources, created_at: msg.created_at };
            });

            totalMessages += messages.length;
            conversations.push({ id: conv.id, title: conv.title, created_at: conv.created_at, updated_at: conv.updated_at, messages });
        }

        const exportData = {
            export_date: new Date().toISOString(),
            user: { id: user.id, name: user.name, email: user.email },
            conversations,
            statistics: { total_conversations: conversations.length, total_messages: totalMessages }
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="noctua-data-${user.id}-${Date.now()}.json"`);
        res.json(exportData);
    } catch (error) {
        console.error('Erreur export données:', error);
        res.status(500).json({ error: 'Erreur lors de l\'export des données' });
    } finally {
        if (client) client.release();
    }
});

app.delete('/api/user/conversations/all', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const conversationsResult = await client.query(
            'SELECT id FROM conversations WHERE user_id = $1', [req.user.id]
        );
        const conversationIds = conversationsResult.rows.map(row => row.id);

        if (conversationIds.length === 0) {
            return res.json({ success: true, message: 'Aucune conversation à supprimer', deleted: 0 });
        }

        await client.query('DELETE FROM messages WHERE conversation_id = ANY($1)', [conversationIds]);
        const deleteResult = await client.query('DELETE FROM conversations WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, message: 'Historique supprimé avec succès', deleted: deleteResult.rowCount });
    } catch (error) {
        console.error('Erreur suppression historique:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression de l\'historique' });
    } finally {
        if (client) client.release();
    }
});

// L'archivage est stocké comme tableau d'entiers sur la ligne users
app.get('/api/user/archived-conversations', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const userResult = await client.query(
            `SELECT COALESCE(archived_conversations, '{}'::integer[]) AS archived_conversations FROM users WHERE id = $1`,
            [req.user.id]
        );
        const archivedIds = userResult.rows[0]?.archived_conversations || [];

        if (archivedIds.length === 0) return res.json([]);

        const convsResult = await client.query(
            'SELECT id, title, created_at, updated_at FROM conversations WHERE id = ANY($1) ORDER BY updated_at DESC',
            [archivedIds]
        );
        res.json(convsResult.rows);
    } catch (err) {
        console.error('Erreur récupération archives:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTES — CONVERSATIONS ======

// Créer une conversation + stocker le premier message
// user_id peut être null pour les conversations invité
app.post('/conversations', async (req, res) => {
    const { user_id, first_message } = req.body;

    if (!first_message || !first_message.trim()) {
        return res.status(400).json({ error: 'Message requis' });
    }

    let client;
    try {
        client = await pool.connect();
        const conversationResult = await client.query(
            'INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *',
            [user_id || null, generateTitle(first_message)]
        );
        const conversation = conversationResult.rows[0];
        await client.query(
            'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW())',
            [conversation.id, 'user', first_message]
        );
        res.json(conversation);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur lors de la création de la conversation' });
    } finally {
        if (client) client.release();
    }
});

// Lister les conversations d'un utilisateur
app.get('/conversations/user/:userId', authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: 'ID utilisateur invalide' });
    // On vérifie qu'on ne lit pas les conversations de quelqu'un d'autre
    if (req.user.id !== userId) return res.status(403).json({ error: 'Accès refusé' });

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur' });
    } finally {
        if (client) client.release();
    }
});

// Récupérer les messages d'une conversation
// Accessible aux invités et aux propriétaires
app.get('/conversations/:conversationId/messages', optionalAuthenticateToken, async (req, res) => {
    let client;
    try {
        const convId = req.params.conversationId;
        client = await pool.connect();

        const convCheck = await client.query(
            'SELECT user_id FROM conversations WHERE id = $1', [convId]
        );
        if (convCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation non trouvée' });
        }

        const convUserId = convCheck.rows[0].user_id;
        if (req.user) {
            // Utilisateur connecté : vérifier qu'il est propriétaire de la conv
            if (convUserId !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
        } else {
            // Invité : peut seulement accéder aux conversations sans propriétaire
            if (convUserId !== null) return res.status(403).json({ error: 'Accès refusé' });
        }

        const result = await client.query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [convId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
    } finally {
        if (client) client.release();
    }
});

app.patch('/conversations/:id/title', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Titre requis' });
    }

    let client;
    try {
        client = await pool.connect();
        // On vérifie que la conversation appartient bien à cet utilisateur avant de modifier
        const check = await client.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, req.user.id]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation non trouvée' });
        }
        await client.query('UPDATE conversations SET title = $1 WHERE id = $2', [title.trim(), id]);
        res.json({ success: true, title: title.trim() });
    } catch (err) {
        console.error('Erreur modification titre:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

app.post('/conversations/:id/archive', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        // array_append + NOT ANY évite les doublons si on archive deux fois
        await client.query(
            `UPDATE users SET archived_conversations = array_append(archived_conversations, $1)
             WHERE id = $2 AND NOT ($1 = ANY(COALESCE(archived_conversations, '{}'::integer[])))`,
            [parseInt(req.params.id), req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur archivage:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

app.delete('/conversations/:id/archive', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query(
            'UPDATE users SET archived_conversations = array_remove(archived_conversations, $1) WHERE id = $2',
            [parseInt(req.params.id), req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur désarchivage:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

app.delete('/conversations/:id', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const conversationResult = await client.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (conversationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation non trouvée ou non autorisée' });
        }

        // Supprimer les messages d'abord à cause de la contrainte de clé étrangère
        await client.query('DELETE FROM messages WHERE conversation_id = $1', [req.params.id]);
        await client.query('DELETE FROM conversations WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Conversation supprimée' });
    } catch (error) {
        console.error('Erreur suppression conversation:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTES — MESSAGES ======

// Voter pour un message bot : 1 = utile, -1 = pas utile, null = annuler le vote
app.patch('/messages/:messageId/note', authenticateToken, async (req, res) => {
    const { note } = req.body;
    if (note !== 1 && note !== -1 && note !== null) {
        return res.status(400).json({ error: 'Note invalide (1, -1 ou null)' });
    }

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'UPDATE messages SET note = $1 WHERE id = $2 RETURNING id, note',
            [note, req.params.messageId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message non trouvé' });
        }
        res.json({ success: true, id: result.rows[0].id, note: result.rows[0].note });
    } catch (err) {
        console.error('Erreur vote message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTES — STATISTIQUES ======

// Compteurs globaux pour la page d'accueil
app.get('/api/stats', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const [convRes, msgRes, userRes, voteRes] = await Promise.all([
            client.query('SELECT COUNT(*) FROM conversations'),
            client.query('SELECT COUNT(*) FROM messages WHERE sender = $1', ['user']),
            client.query('SELECT COUNT(*) FROM "users"'),
            client.query(`SELECT
                COUNT(*) FILTER (WHERE note = 1) AS upvotes,
                COUNT(*) FILTER (WHERE note = -1) AS downvotes
                FROM messages WHERE note IS NOT NULL`)
        ]);

        const upvotes = parseInt(voteRes.rows[0].upvotes);
        const downvotes = parseInt(voteRes.rows[0].downvotes);
        const totalVotes = upvotes + downvotes;

        res.json({
            conversations: parseInt(convRes.rows[0].count),
            questions: parseInt(msgRes.rows[0].count),
            users: parseInt(userRes.rows[0].count),
            satisfaction: totalVotes > 0 ? Math.round((upvotes / totalVotes) * 100) : null
        });
    } catch (err) {
        console.error('Erreur stats:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Données de séries temporelles pour les graphiques de la page d'accueil
app.get('/api/stats/charts', async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        const conversations = (await client.query(
            `SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*) AS count
             FROM conversations WHERE created_at >= NOW() - INTERVAL '30 days'
             GROUP BY day ORDER BY day ASC`
        )).rows;

        const messages = (await client.query(
            `SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*) AS count
             FROM messages WHERE sender = 'user' AND created_at >= NOW() - INTERVAL '30 days'
             GROUP BY day ORDER BY day ASC`
        )).rows;

        const users = (await client.query(
            `SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*) AS count
             FROM "users" WHERE created_at >= NOW() - INTERVAL '3 months'
             GROUP BY day ORDER BY day ASC`
        )).rows;

        const satisfaction = (await client.query(
            `SELECT DATE_TRUNC('week', created_at)::date AS week,
                 COUNT(*) FILTER (WHERE note = 1) AS upvotes,
                 COUNT(*) FILTER (WHERE note = -1) AS downvotes
             FROM messages WHERE note IS NOT NULL AND created_at >= NOW() - INTERVAL '5 weeks'
             GROUP BY week ORDER BY week ASC`
        )).rows;

        res.json({ conversations, messages, users, satisfaction });
    } catch (err) {
        console.error('Erreur stats charts:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTES — ADMINISTRATION ======

// Statut du serveur Mistral
app.get('/api/admin/mistral/status', authenticateToken, isAdmin, (req, res) => {
    exec(`${scriptsPath}/status_mistral.sh`, (error, stdout) => {
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.json({ success: false, message: 'Erreur de connexion au serveur', status: 'unknown' });
        }
    });
});

// Démarrer Mistral en arrière-plan
app.post('/api/admin/mistral/start', authenticateToken, isAdmin, (req, res) => {
    console.log('Démarrage Mistral...');
    const userId = req.user.id;

    // Vérifier d'abord si Mistral tourne déjà pour éviter un double démarrage
    exec(`${scriptsPath}/status_mistral.sh`, { timeout: 15000 }, (error, stdout) => {
        if (!error && stdout.includes('"running"')) {
            return res.json({ success: false, message: 'Mistral est déjà en cours d\'exécution', status: 'running' });
        }

        // Lancer le démarrage en détaché pour ne pas bloquer la réponse HTTP
        const child = exec(`${scriptsPath}/start_mistral.sh`, { timeout: 60000, detached: true });
        child.unref();

        logAdminAction(userId, 'Démarrage du serveur Mistral');
        res.json({ success: true, message: 'Démarrage de Mistral en cours...', status: 'loading' });
    });
});

app.post('/api/admin/mistral/stop', authenticateToken, isAdmin, (req, res) => {
    const userId = req.user.id;

    exec(`${scriptsPath}/stop_mistral.sh`, { timeout: 30000 }, (error, stdout) => {
        try {
            const result = JSON.parse(stdout);
            if (result.success) logAdminAction(userId, 'Arrêt du serveur Mistral');
            res.json(result);
        } catch (e) {
            res.json({ success: false, message: 'Erreur lors de l\'arrêt', status: 'unknown' });
        }
    });
});

// Liste des utilisateurs avec recherche
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    let client;
    try {
        const search = req.query.search || '';
        const limit = 25;
        client = await pool.connect();
        const result = search
            ? await client.query(
                'SELECT id, name, email, admin FROM "users" WHERE email ILIKE $1 ORDER BY email ASC LIMIT $2',
                [`%${search}%`, limit]
              )
            : await client.query(
                'SELECT id, name, email, admin FROM "users" ORDER BY email ASC LIMIT $1',
                [limit]
              );
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
    } finally {
        if (client) client.release();
    }
});

// Promouvoir ou rétrograder un utilisateur
app.post('/api/admin/users/:userId/toggle-admin', authenticateToken, isAdmin, async (req, res) => {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;

    // Un admin ne peut pas modifier son propre statut
    if (parseInt(targetUserId) === parseInt(currentUserId)) {
        return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre statut admin' });
    }

    let client;
    try {
        client = await pool.connect();
        const userResult = await client.query(
            'SELECT id, name, email, admin FROM "users" WHERE id = $1',
            [targetUserId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        const newAdmin = !userResult.rows[0].admin;
        await client.query('UPDATE "users" SET admin = $1 WHERE id = $2', [newAdmin, targetUserId]);

        const actionMessage = newAdmin
            ? `Promotion admin de l'utilisateur ${userResult.rows[0].email}`
            : `Retrait des droits admin de l'utilisateur ${userResult.rows[0].email}`;
        logAdminAction(currentUserId, actionMessage);

        res.json({
            success: true,
            user: { id: userResult.rows[0].id, name: userResult.rows[0].name, email: userResult.rows[0].email, admin: newAdmin },
            message: newAdmin ? 'Utilisateur promu admin' : 'Droits admin retirés'
        });
    } catch (error) {
        console.error('Erreur modification admin:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/admin/logs', authenticateToken, isAdmin, async (req, res) => {
    let client;
    try {
        const limit = parseInt(req.query.limit) || 50;
        client = await pool.connect();
        const result = await client.query(
            'SELECT id, user_email, action, created_at FROM admin_logs ORDER BY created_at DESC LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération logs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTES — CLÉS API ======

// Liste les clés API de l'utilisateur connecté
app.get('/api/keys', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT id, name, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur liste clés API:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Génère une nouvelle clé API pour l'utilisateur connecté
app.post('/api/keys', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom de clé requis' });

    const MAX_KEYS = 5;
    const key = 'nai_' + crypto.randomBytes(24).toString('hex');
    let client;
    try {
        client = await pool.connect();
        const countResult = await client.query(
            'SELECT COUNT(*) FROM api_keys WHERE user_id = $1',
            [req.user.id]
        );
        if (parseInt(countResult.rows[0].count) >= MAX_KEYS) {
            return res.status(400).json({ error: `Limite atteinte (${MAX_KEYS} clés maximum)` });
        }
        const result = await client.query(
            'INSERT INTO api_keys (user_id, key, name) VALUES ($1, $2, $3) RETURNING id, name, created_at',
            [req.user.id, key, name.trim()]
        );
        // Retourne la clé en clair une seule fois à la création
        res.status(201).json({ ...result.rows[0], key });
    } catch (err) {
        console.error('Erreur création clé API:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Supprime une clé API (vérifie l'ownership)
app.delete('/api/keys/:keyId', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.keyId, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Clé non trouvée' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression clé API:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// ====== ROUTE — API PUBLIQUE ======

// Endpoint REST public pour envoyer un message au LLM via clé API
app.post('/api/v1/chat', authenticateApiKey, async (req, res) => {
    const { message, conversation_id } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message requis' });

    let client;
    try {
        client = await pool.connect();
        let convId = conversation_id;

        const apiUserId = req.apiKey.user_id;

        if (convId) {
            // Vérifier que la conversation existe et appartient à cet utilisateur
            const convCheck = await client.query(
                'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
                [convId, apiUserId]
            );
            if (convCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Conversation non trouvée' });
            }
        } else {
            // Créer une nouvelle conversation liée à l'utilisateur propriétaire de la clé
            const convResult = await client.query(
                'INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id',
                [apiUserId, generateTitle(message)]
            );
            convId = convResult.rows[0].id;
        }

        // Insérer le message utilisateur
        await client.query(
            'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW())',
            [convId, 'user', message]
        );
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);

        // Construire le contexte (max 20 derniers messages)
        const historyResult = await client.query(
            'SELECT sender, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [convId]
        );
        let messages = historyResult.rows.map(row => ({
            role: row.sender === 'user' ? 'user' : 'assistant',
            content: row.content
        }));
        if (messages.length > 20) messages = messages.slice(-20);

        // Appeler le RAG
        let aiMessage;
        let aiSources = [];
        try {
            const ragResponse = await axios.post(RAG_API_URL, {
                model: RAG_MODEL,
                messages,
                stream: false
            }, { timeout: 120000 });

            aiMessage = ragResponse.data.message.content;
            aiSources = ragResponse.data.sources || [];

            aiMessage = aiMessage.replace(/^[ \t]*[-*]?\s*\*{0,2}\[?(?:Sources?\s*)?\d+\]?\*{0,2}\s*:.*$/gm, '');
            aiMessage = aiMessage.replace(/^[ \t]*\*{0,2}Sources?\s*:?\s*\*{0,2}$/gim, '');
            aiMessage = aiMessage.replace(/^.*(?:consulter|voir|référer|retrouver)\s+(?:les\s+)?sources?\s+(?:fournies?|ci-dessus|ci-dessous|mentionnées?|suivantes?).*$/gim, '');
            aiMessage = aiMessage.replace(/\n{3,}/g, '\n\n').trim();
        } catch (ragError) {
            console.error('[RAG] Erreur API (v1/chat):', ragError.message);
            aiMessage = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
            aiSources = [];
        }

        // Stocker la réponse bot
        await client.query(
            'INSERT INTO messages (conversation_id, sender, content, sources, created_at) VALUES ($1, $2, $3, $4, NOW())',
            [convId, 'bot', aiMessage, JSON.stringify(aiSources)]
        );
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);

        res.json({
            conversation_id: convId,
            response: { content: aiMessage, sources: aiSources }
        });
    } catch (err) {
        console.error('Erreur API v1/chat:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Liste les conversations de l'utilisateur propriétaire de la clé
app.get('/api/v1/conversations', authenticateApiKey, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.apiKey.user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur API v1/conversations:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Récupère tous les messages d'une conversation (doit appartenir à l'utilisateur)
app.get('/api/v1/conversations/:id/messages', authenticateApiKey, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const convCheck = await client.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
            [req.params.id, req.apiKey.user_id]
        );
        if (convCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation non trouvée' });
        }
        const result = await client.query(
            'SELECT id, sender, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur API v1/conversations/messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// Envoie un message dans une conversation existante et retourne la réponse du LLM
app.post('/api/v1/conversations/:id/messages', authenticateApiKey, async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message requis' });

    let client;
    try {
        client = await pool.connect();

        // Vérifier que la conversation existe et appartient à l'utilisateur
        const convCheck = await client.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
            [req.params.id, req.apiKey.user_id]
        );
        if (convCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation non trouvée' });
        }

        // Insérer le message utilisateur
        await client.query(
            'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW())',
            [req.params.id, 'user', message]
        );
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [req.params.id]);

        // Construire le contexte (max 20 derniers messages)
        const historyResult = await client.query(
            'SELECT sender, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        let messages = historyResult.rows.map(row => ({
            role: row.sender === 'user' ? 'user' : 'assistant',
            content: row.content
        }));
        if (messages.length > 20) messages = messages.slice(-20);

        // Appeler le RAG
        let aiMessage;
        let aiSources = [];
        try {
            const ragResponse = await axios.post(RAG_API_URL, {
                model: RAG_MODEL,
                messages,
                stream: false
            }, { timeout: 120000 });

            aiMessage = ragResponse.data.message.content;
            aiSources = ragResponse.data.sources || [];

            aiMessage = aiMessage.replace(/^[ \t]*[-*]?\s*\*{0,2}\[?(?:Sources?\s*)?\d+\]?\*{0,2}\s*:.*$/gm, '');
            aiMessage = aiMessage.replace(/^[ \t]*\*{0,2}Sources?\s*:?\s*\*{0,2}$/gim, '');
            aiMessage = aiMessage.replace(/^.*(?:consulter|voir|référer|retrouver)\s+(?:les\s+)?sources?\s+(?:fournies?|ci-dessus|ci-dessous|mentionnées?|suivantes?).*$/gim, '');
            aiMessage = aiMessage.replace(/\n{3,}/g, '\n\n').trim();
        } catch (ragError) {
            console.error('[RAG] Erreur API (v1/conversations/messages):', ragError.message);
            aiMessage = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
            aiSources = [];
        }

        // Stocker la réponse bot
        const botMsgResult = await client.query(
            'INSERT INTO messages (conversation_id, sender, content, sources, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, created_at',
            [req.params.id, 'bot', aiMessage, JSON.stringify(aiSources)]
        );
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [req.params.id]);

        res.json({
            message: { id: botMsgResult.rows[0].id, sender: 'bot', content: aiMessage, sources: aiSources, created_at: botMsgResult.rows[0].created_at }
        });
    } catch (err) {
        console.error('Erreur API v1/conversations/messages POST:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        if (client) client.release();
    }
});

// ====== SOCKET.IO ======

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {

    // Rejoindre la room de la conversation pour recevoir les messages en temps réel
    socket.on('join-conversation', (conversationId) => {
        socket.join(`conversation-${conversationId}`);
    });

    socket.on('send-message', async (data) => {
        try {
            const { conversationId, userId, message, alreadySaved } = data;

            if (!conversationId || !message) {
                socket.emit('error', { message: 'Données invalides' });
                return;
            }

            const client = await pool.connect();

            try {
                // Vérifier que la conversation existe et que l'utilisateur y a accès
                const convCheck = await client.query(
                    'SELECT id, user_id FROM conversations WHERE id = $1',
                    [conversationId]
                );
                if (convCheck.rows.length === 0) {
                    socket.emit('error', { message: 'Conversation non trouvée' });
                    return;
                }

                const conversation = convCheck.rows[0];
                if (conversation.user_id !== null && !userId) {
                    socket.emit('error', { message: 'Authentification requise' });
                    return;
                }

                if (!alreadySaved) {
                    // Stocker le message utilisateur en base
                    const userMsgResult = await client.query(
                        'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, created_at',
                        [conversationId, 'user', message]
                    );
                    const userMsg = userMsgResult.rows[0];

                    await client.query(
                        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
                        [conversationId]
                    );

                    // Émettre le message utilisateur à la room
                    io.to(`conversation-${conversationId}`).emit('receive-message', {
                        sender: 'user',
                        content: message,
                        id: userMsg.id,
                        created_at: userMsg.created_at
                    });
                }

                // Construire le contexte pour le RAG
                const historyResult = await client.query(
                    'SELECT sender, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
                    [conversationId]
                );
                let messages = historyResult.rows.map(row => ({
                    role: row.sender === 'user' ? 'user' : 'assistant',
                    content: row.content
                }));
                if (messages.length > 20) messages = messages.slice(-20);

                // Appeler l'API RAG
                let aiMessage;
                let aiSources = [];
                try {
                    const ragResponse = await axios.post(RAG_API_URL, {
                        model: RAG_MODEL,
                        messages,
                        stream: false
                    }, {
                        timeout: 120000  // 2 minutes max pour la génération
                    });

                    aiMessage = ragResponse.data.message.content;
                    aiSources = ragResponse.data.sources || [];

                    // Nettoyer les lignes de type "Sources : [1], [2]" que Mistral peut ajouter
                    aiMessage = aiMessage.replace(/^[ \t]*[-*]?\s*\*{0,2}\[?(?:Sources?\s*)?\d+\]?\*{0,2}\s*:.*$/gm, '');
                    aiMessage = aiMessage.replace(/^[ \t]*\*{0,2}Sources?\s*:?\s*\*{0,2}$/gim, '');
                    aiMessage = aiMessage.replace(/^.*(?:consulter|voir|référer|retrouver)\s+(?:les\s+)?sources?\s+(?:fournies?|ci-dessus|ci-dessous|mentionnées?|suivantes?).*$/gim, '');
                    aiMessage = aiMessage.replace(/\n{3,}/g, '\n\n').trim();

                } catch (ragError) {
                    console.error('[RAG] Erreur API:', ragError.message);
                    aiMessage = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
                    aiSources = [];
                }

                // Stocker la réponse IA avec ses sources
                const botMsgResult = await client.query(
                    'INSERT INTO messages (conversation_id, sender, content, sources, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, created_at',
                    [conversationId, 'bot', aiMessage, JSON.stringify(aiSources)]
                );
                const botMsg = botMsgResult.rows[0];

                await client.query(
                    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
                    [conversationId]
                );

                // Émettre la réponse IA à tous les clients de la room
                io.to(`conversation-${conversationId}`).emit('receive-message', {
                    sender: 'bot',
                    content: aiMessage,
                    sources: aiSources,
                    id: botMsg.id,
                    created_at: botMsg.created_at
                });

            } finally {
                client.release();
            }

        } catch (error) {
            console.error('[Socket] Erreur traitement message:', error);
            socket.emit('error', { message: 'Erreur lors du traitement du message' });
        }
    });

    socket.on('disconnect', () => {});
});

// ====== DÉMARRAGE ======

server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
