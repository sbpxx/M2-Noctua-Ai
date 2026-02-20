require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const app = express();
const port = 8080;
const path = require('path');
const pool = require('./js/libraryBDD'); // Importer le pool de connexions
const jwt = require('jsonwebtoken');

const secretKey = process.env.JWT_SECRET || 'fallback-secret-key'; // Clé secrète pour signer les JWT
// API RAG (remplace Ollama)
const RAG_API_URL = process.env.RAG_API_URL || 'http://127.0.0.1:5000/api/chat';
const RAG_MODEL = 'rag-mistral';

// Fonction pour enregistrer log admin
async function logAdminAction(userId, action) {
    try {
        const client = await pool.connect();
        // Récupérer l'email de l'utilisateur
        const userResult = await client.query(
            'SELECT email FROM "users" WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length > 0) {
            const userEmail = userResult.rows[0].email;
            await client.query(
                'INSERT INTO admin_logs (user_email, action) VALUES ($1, $2)',
                [userEmail, action]
            );
            console.log(`[LOG ADMIN] ${userEmail} : ${action}`);
        }
        client.release();
    } catch (err) {
        console.error('Erreur enregistrement log admin:', err.message);
    }
}

// Configurer le moteur de templates EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const isDev = process.env.NODE_ENV !== 'production';
app.use(express.static('.', isDev ? {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store');
    }
} : {}));
app.use(express.json());

app.get('/favicon.ico', function(req, res) {
    res.status(204).end(); // No Content - évite l'erreur 404 dans la console
});

app.get('/', function(req, res) {
    res.render('accueil'); // Utiliser le template EJS pour la page d'accueil
});

app.get('/chat', function(req, res) {
    res.render('chat'); // Utiliser le template EJS pour la page "cCat"
});

app.get('/begin', function(req, res) {
    res.render('begin'); // Utiliser le template EJS pour la page "Start Chat"
});


// Ajouter un utilisateur à la BDD
app.post('/register', async (req, res) => {
    try {
        console.log("Requête reçue pour ajouter un utilisateur");
        console.log("Corps de la requête:", req.body);

        const client = await pool.connect();

        // Vérifier si l'adresse e-mail est déjà utilisée
        const emailCheck = await client.query(
            'SELECT * FROM "users" WHERE email = $1',
            [req.body.email]
        );

        if (emailCheck.rows.length > 0) {
            console.log("Adresse e-mail déjà utilisée");
            res.status(400).json({ error: 'Adresse e-mail déjà utilisée' });
            client.release();
            return;
        }

        const result = await client.query(
            'INSERT INTO "users" (name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [req.body.nom, req.body.email, req.body.mot_de_passe]
        );

        const newUser = result.rows[0];
        console.log("INSCRIPTION RÉUSSIE");
        console.log("Nouvel utilisateur créé:", {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email
        });
        res.json(newUser);
        client.release();
    } catch (err) {
        console.error('Erreur lors de l\'ajout de l\'utilisateur:', err.stack);
        res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'utilisateur' });
    }
});

// Route POST pour la connexion
app.post('/login', async (req, res) => {
    try {
        console.log("Requête reçue pour la connexion");
        console.log("Corps de la requête:", req.body);

        const client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM "users" WHERE email = $1 AND password = $2',
            [req.body.email, req.body.password]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log("CONNEXION RÉUSSIE");
            console.log("Utilisateur connecté:", {
                id: user.id,
                name: user.name,
                email: user.email
            });
            const token = jwt.sign({ id: user.id }, secretKey, { expiresIn: '1h' });
            res.status(200).json({ token });
        } else {
            // Regarder si le mail existe
            const emailCheck = await client.query(
                'SELECT * FROM "users" WHERE email = $1',
                [req.body.email]
            );
            if (emailCheck.rows.length > 0) {
                console.log("Mot de passe incorrect");
                res.status(400).json({ error: 'Mot de passe incorrect' });
            } else {
                console.log("Utilisateur non trouvé");
                res.status(400).json({ error: 'Utilisateur non trouvé' });
            }
        }

        client.release();
    } catch (err) {
        console.error('Erreur lors de la connexion:', err.stack);
        res.status(500).json({ error: 'Erreur lors de la connexion' });
    }
});

// Route pour obtenir les informations de l'utilisateur
// Route pour obtenir les informations de l'utilisateur
app.get('/user', authenticateToken, async (req, res) => {
    try {
        const email = req.query.email;
        console.log("Requête reçue pour obtenir les informations de l'utilisateur");
        console.log("Email de l'utilisateur:", email);

        const client = await pool.connect();
        const result = await client.query(
            'SELECT id, name, email, admin FROM "users" WHERE email = $1',
            [email]
        );

        console.log("Résultat de la requête:", result.rows[0]);
        res.json(result.rows[0]);
        client.release();
    } catch (err) {
        console.error('Erreur lors de la récupération des informations de l\'utilisateur:', err.stack);
        res.status(500).json({ error: 'Erreur lors de la récupération des informations de l\'utilisateur' });
    }
});

// Middleware pour vérifier le JWT
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

// Exemple de route protégée
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Accès autorisé', user: req.user });
});

// vérification si l'utilisateur est admin
async function isAdmin(req, res, next) {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT admin FROM "users" WHERE id = $1',
            [req.user.id]
        );
        client.release();

        if (result.rows.length === 0 || !result.rows[0].admin) {
            return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
        }
        next();
    } catch (err) {
        console.error('Erreur vérification admin:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
}

// Routes Admin pour controle de Mistral

const { exec } = require('child_process');
const scriptsPath = path.join(__dirname, 'scripts');

// Statut de Mistral
app.get('/api/admin/mistral/status', authenticateToken, isAdmin, (req, res) => {
    exec(`${scriptsPath}/status_mistral.sh`, (error, stdout, stderr) => {
        try {
            const result = JSON.parse(stdout);
            res.json(result);
        } catch (e) {
            res.json({ success: false, message: 'Erreur de connexion au serveur', status: 'unknown' });
        }
    });
});

// Démarrer Mistral
app.post('/api/admin/mistral/start', authenticateToken, isAdmin, (req, res) => {
    console.log('Démarrage Mistral...');
    const userId = req.user.id;

    // Vérifier d'abord si Mistral est déjà en cours
    exec(`${scriptsPath}/status_mistral.sh`, { timeout: 15000 }, (error, stdout, stderr) => {
        if (!error && stdout.includes('"running"')) {
            return res.json({ success: false, message: 'Mistral est déjà en cours d\'exécution', status: 'running' });
        }

        // Lancer le démarrage en arrière-plan (détaché)
        const child = exec(`${scriptsPath}/start_mistral.sh`, { timeout: 60000, detached: true });
        child.unref();

        // Enregistrer le log
        logAdminAction(userId, 'Démarrage du serveur Mistral');

        // Retourner immédiatement
        res.json({ success: true, message: 'Démarrage de Mistral en cours...', status: 'loading' });
    });
});

// Arrêter Mistral
app.post('/api/admin/mistral/stop', authenticateToken, isAdmin, (req, res) => {
    const userId = req.user.id;

    exec(`${scriptsPath}/stop_mistral.sh`, { timeout: 30000 }, (error, stdout, stderr) => {
        try {
            const result = JSON.parse(stdout);

            // Enregistrer le log arrêt
            if (result.success) {
                logAdminAction(userId, 'Arrêt du serveur Mistral');
            }

            res.json(result);
        } catch (e) {
            res.json({ success: false, message: 'Erreur lors de l\'arrêt', status: 'unknown' });
        }
    });
});

// Route pour récupérer les utilisateurs (admin)
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const search = req.query.search || '';
        const limit = 25;

        const client = await pool.connect();

        let result;
        if (search) {
            result = await client.query(
                'SELECT id, name, email, admin FROM "users" WHERE email ILIKE $1 ORDER BY email ASC LIMIT $2',
                [`%${search}%`, limit]
            );
        } else {
            result = await client.query(
                'SELECT id, name, email, admin FROM "users" ORDER BY email ASC LIMIT $1',
                [limit]
            );
        }

        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
    }
});

// Route pour modifier le statut admin d'un utilisateur
app.post('/api/admin/users/:userId/toggle-admin', authenticateToken, isAdmin, async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const currentUserId = req.user.id;

        // Empêche de modifier son propre statut 
        if (parseInt(targetUserId) === parseInt(currentUserId)) {
            return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre statut admin' });
        }

        const client = await pool.connect();

        // Récupérer le statut actuel
        const userResult = await client.query(
            'SELECT id, name, email, admin FROM "users" WHERE id = $1',
            [targetUserId]
        );

        if (userResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        const currentAdmin = userResult.rows[0].admin;
        const newAdmin = !currentAdmin;
        const targetEmail = userResult.rows[0].email;

        // Mettre à jour le statut
        await client.query(
            'UPDATE "users" SET admin = $1 WHERE id = $2',
            [newAdmin, targetUserId]
        );

        client.release();

        // Enregistrer le log
        const actionMessage = newAdmin
            ? `Promotion admin de l'utilisateur ${targetEmail}`
            : `Retrait des droits admin de l'utilisateur ${targetEmail}`;
        logAdminAction(currentUserId, actionMessage);

        res.json({
            success: true,
            user: {
                id: userResult.rows[0].id,
                name: userResult.rows[0].name,
                email: userResult.rows[0].email,
                admin: newAdmin
            },
            message: newAdmin ? 'Utilisateur promu admin' : 'Droits admin retirés'
        });
    } catch (error) {
        console.error('Erreur modification admin:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

// Route pour récupérer les logs admin
app.get('/api/admin/logs', authenticateToken, isAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const client = await pool.connect();

        const result = await client.query(
            'SELECT id, user_email, action, created_at FROM admin_logs ORDER BY created_at DESC LIMIT $1',
            [limit]
        );

        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération logs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
    }
});

// Route pour exporter les données utilisateur
app.get('/api/user/export-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const client = await pool.connect();

        try {
            // Récupérer les informations utilisateur 
            const userResult = await client.query(
                'SELECT id, name, email FROM "users" WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            const user = userResult.rows[0];

            // Récupérer toutes les conversations de l'utilisateur
            const conversationsResult = await client.query(
                'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY created_at ASC',
                [userId]
            );

            const conversations = [];
            let totalMessages = 0;

            // Pour chaque conversation, récupérer les messages
            for (const conv of conversationsResult.rows) {
                const messagesResult = await client.query(
                    'SELECT sender, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
                    [conv.id]
                );

                const messages = messagesResult.rows.map(msg => {
                    let sources = null;
                    if (msg.sources) {
                        // Si c'est déjà un objet, l'utiliser directement
                        if (typeof msg.sources === 'object') {
                            sources = msg.sources;
                        } else if (typeof msg.sources === 'string' && msg.sources.trim()) {
                            try {
                                sources = JSON.parse(msg.sources);
                            } catch (e) {
                                sources = null;
                            }
                        }
                    }
                    return {
                        sender: msg.sender,
                        content: msg.content,
                        sources: sources,
                        created_at: msg.created_at
                    };
                });

                totalMessages += messages.length;

                conversations.push({
                    id: conv.id,
                    title: conv.title,
                    created_at: conv.created_at,
                    updated_at: conv.updated_at,
                    messages: messages
                });
            }

            // Construire l'objet 
            const exportData = {
                export_date: new Date().toISOString(),
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                },
                conversations: conversations,
                statistics: {
                    total_conversations: conversations.length,
                    total_messages: totalMessages
                }
            };

            client.release();

            // Envoyer le fichier JSON* pour téléchargement
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="noctua-data-${user.id}-${Date.now()}.json"`);
            res.json(exportData);

        } catch (error) {
            client.release();
            throw error;
        }

    } catch (error) {
        console.error('Erreur export données:', error);
        res.status(500).json({ error: 'Erreur lors de l\'export des données' });
    }
});

// Route pour changer le mot de passe
app.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.body;
        console.log("Requête reçue pour changer le mot de passe");
        console.log("Email:", email);

        if (!email || !oldPassword || !newPassword) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        const client = await pool.connect();

        // Vérifier que l'ancien mot de passe est correct
        const userCheck = await client.query(
            'SELECT * FROM "users" WHERE email = $1 AND password = $2',
            [email, oldPassword]
        );

        if (userCheck.rows.length === 0) {
            console.log("Ancien mot de passe incorrect");
            client.release();
            return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
        }

        // Mettre à jour le mot de passe
        await client.query(
            'UPDATE "users" SET password = $1 WHERE email = $2',
            [newPassword, email]
        );

        console.log("Mot de passe modifié avec succès");
        client.release();
        res.json({ message: 'Mot de passe modifié avec succès' });
    } catch (err) {
        console.error('Erreur lors du changement de mot de passe:', err.stack);
        res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
    }
});

// Créer une discussion et stocker le premier message
app.post('/conversations', async (req, res) => {
    try {
        const { user_id, first_message } = req.body;

        // Validation du message
        if (!first_message || !first_message.trim()) {
            return res.status(400).json({ error: 'Message requis' });
        }

        const client = await pool.connect();

        const title = first_message.substring(0, 50);
        // Accepter NULL pour les invités
        const conversationResult = await client.query(
            'INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *',
            [user_id || null, title]
        );

        const conversation = conversationResult.rows[0];

        await client.query(
            'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW())',
            [conversation.id, 'user', first_message]
        );

        client.release();
        res.json(conversation);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur lors de la création de la conversation' });
    }
});

// Récupérer les discussions d'un utilisateur
app.get('/conversations/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) return res.status(400).json({ error: 'ID utilisateur invalide' });

        const client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
            [userId]
        );
        client.release();
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur' });
    }
});

// Récupérer les messages d'une conversation
app.get('/conversations/:conversationId/messages', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [req.params.conversationId]
        );
        client.release();
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
    }
});

// Modifier le titre d'une conversation
app.patch('/conversations/:id/title', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const userId = req.user.id;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Titre requis' });
        }

        const client = await pool.connect();
        const check = await client.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (check.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Conversation non trouvée' });
        }

        await client.query('UPDATE conversations SET title = $1 WHERE id = $2', [title.trim(), id]);
        client.release();
        res.json({ success: true, title: title.trim() });
    } catch (err) {
        console.error('Erreur modification titre:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Archiver une conversation
app.post('/conversations/:id/archive', authenticateToken, async (req, res) => {
    try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;

        const client = await pool.connect();
        await client.query(
            `UPDATE users SET archived_conversations = array_append(archived_conversations, $1)
             WHERE id = $2 AND NOT ($1 = ANY(COALESCE(archived_conversations, '{}'::integer[])))`,
            [conversationId, userId]
        );
        client.release();
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur archivage:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Désarchiver une conversation
app.delete('/conversations/:id/archive', authenticateToken, async (req, res) => {
    try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user.id;

        const client = await pool.connect();
        await client.query(
            'UPDATE users SET archived_conversations = array_remove(archived_conversations, $1) WHERE id = $2',
            [conversationId, userId]
        );
        client.release();
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur désarchivage:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer les conversations archivées
app.get('/api/user/archived-conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const client = await pool.connect();

        const userResult = await client.query(
            `SELECT COALESCE(archived_conversations, '{}'::integer[]) AS archived_conversations FROM users WHERE id = $1`,
            [userId]
        );
        const archivedIds = userResult.rows[0]?.archived_conversations || [];

        if (archivedIds.length === 0) {
            client.release();
            return res.json([]);
        }

        const convsResult = await client.query(
            'SELECT id, title, created_at, updated_at FROM conversations WHERE id = ANY($1) ORDER BY updated_at DESC',
            [archivedIds]
        );
        client.release();
        res.json(convsResult.rows);
    } catch (err) {
        console.error('Erreur récupération archives:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Voter pour un message bot (1 = upvote, -1 = downvote)
app.patch('/messages/:messageId/note', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { note } = req.body;

        if (note !== 1 && note !== -1 && note !== null) {
            return res.status(400).json({ error: 'Note invalide (1, -1 ou null)' });
        }

        const client = await pool.connect();
        const result = await client.query(
            'UPDATE messages SET note = $1 WHERE id = $2 RETURNING id, note',
            [note, messageId]
        );
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message non trouvé' });
        }

        res.json({ success: true, id: result.rows[0].id, note: result.rows[0].note });
    } catch (err) {
        console.error('Erreur vote message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer une conversation
app.delete('/conversations/:id', authenticateToken, async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.user.id;

        const client = await pool.connect();

        try {
            // Vérifier que la conversation appartient à l'utilisateur
            const conversationResult = await client.query(
                'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
                [conversationId, userId]
            );

            if (conversationResult.rows.length === 0) {
                client.release();
                return res.status(404).json({ error: 'Conversation non trouvée ou non autorisée' });
            }

            // Supprimer les messages associés
            await client.query(
                'DELETE FROM messages WHERE conversation_id = $1',
                [conversationId]
            );

            // Supprimer la conversation
            await client.query(
                'DELETE FROM conversations WHERE id = $1',
                [conversationId]
            );

            client.release();
            res.json({ success: true, message: 'Conversation supprimée' });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('Erreur suppression conversation:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer toutes les conversations d'un utilisateur
app.delete('/api/user/conversations/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const client = await pool.connect();

        try {
            // Récupérer les IDs des conversations de l'utilisateur
            const conversationsResult = await client.query(
                'SELECT id FROM conversations WHERE user_id = $1',
                [userId]
            );

            const conversationIds = conversationsResult.rows.map(row => row.id);

            if (conversationIds.length === 0) {
                client.release();
                return res.json({ success: true, message: 'Aucune conversation à supprimer', deleted: 0 });
            }

            // Supprimer tous les messages des conversations
            await client.query(
                'DELETE FROM messages WHERE conversation_id = ANY($1)',
                [conversationIds]
            );

            // Supprimer toutes les conversations
            const deleteResult = await client.query(
                'DELETE FROM conversations WHERE user_id = $1',
                [userId]
            );

            client.release();
            res.json({
                success: true,
                message: 'Historique supprimé avec succès',
                deleted: deleteResult.rowCount
            });

        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('Erreur suppression historique:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression de l\'historique' });
    }
});

// Créer serveur HTTP et Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.io handlers
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Rejoindre une conversation
    socket.on('join-conversation', (conversationId) => {
        socket.join(`conversation-${conversationId}`);
        console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
    });

    // Gérer l'envoi de messages
    socket.on('send-message', async (data) => {
        try {
            const { conversationId, userId, message, isGuest } = data;

            if (!conversationId || !message) {
                socket.emit('error', { message: 'Données invalides' });
                return;
            }

            const client = await pool.connect();

            try {
                // Vérifier que la conversation existe
                const convCheck = await client.query(
                    'SELECT id, user_id FROM conversations WHERE id = $1',
                    [conversationId]
                );

                if (convCheck.rows.length === 0) {
                    socket.emit('error', { message: 'Conversation non trouvée' });
                    client.release();
                    return;
                }

                const conversation = convCheck.rows[0];

                // non accès aux conv
                if (conversation.user_id !== null && !userId) {
                    socket.emit('error', { message: 'Authentification requise' });
                    client.release();
                    return;
                }

                // Stocker le message utilisateur
                const userMsgResult = await client.query(
                    'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, created_at',
                    [conversationId, 'user', message]
                );
                const userMsg = userMsgResult.rows[0];

                // Mettre à jour la conversation
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

                // Récupérer l'historique pour le contexte
                const historyResult = await client.query(
                    'SELECT sender, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
                    [conversationId]
                );

                // Construire le contexte pour le RAG (limiter à 20 derniers messages)
                let messages = historyResult.rows.map(row => ({
                    role: row.sender === 'user' ? 'user' : 'assistant',
                    content: row.content
                }));

                // Limiter le contexte pour éviter de dépasser la fenêtre
                if (messages.length > 20) {
                    messages = messages.slice(-20);
                }

                // Appeler l'API RAG
                let aiMessage;
                let aiSources = [];
                try {
                    console.log('Calling RAG API...');
                    const ragResponse = await axios.post(RAG_API_URL, {
                        model: RAG_MODEL,
                        messages: messages,
                        stream: false
                    }, {
                        timeout: 120000 // Timeout plus long pour le RAG
                    });

                    aiMessage = ragResponse.data.message.content;
                    aiSources = ragResponse.data.sources || [];
                    console.log('RAG response received with', aiSources.length, 'sources');

                    // Nettoyage des blocs de sources en fin de réponse
                    aiMessage = aiMessage.replace(/^[ \t]*[-*]?\s*\*{0,2}\[?(?:Sources?\s*)?\d+\]?\*{0,2}\s*:.*$/gm, '');
                    aiMessage = aiMessage.replace(/^[ \t]*\*{0,2}Sources?\s*:?\s*\*{0,2}$/gim, '');
                    aiMessage = aiMessage.replace(/^.*(?:consulter|voir|référer|retrouver)\s+(?:les\s+)?sources?\s+(?:fournies?|ci-dessus|ci-dessous|mentionnées?|suivantes?).*$/gim, '');
                    aiMessage = aiMessage.replace(/\n{3,}/g, '\n\n').trim();

                } catch (ragError) {
                    console.error('RAG API error:', ragError.message);
                    aiMessage = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
                    aiSources = [];
                }

                // Stocker la réponse IA avec les sources
                const botMsgResult = await client.query(
                    'INSERT INTO messages (conversation_id, sender, content, sources, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, created_at',
                    [conversationId, 'bot', aiMessage, JSON.stringify(aiSources)]
                );
                const botMsg = botMsgResult.rows[0];

                // Mettre à jour la conversation à nouveau
                await client.query(
                    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
                    [conversationId]
                );

                // Émettre la réponse IA à la room avec les sources
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
            console.error('Error processing message:', error);
            socket.emit('error', { message: 'Erreur lors du traitement du message' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(port, () => {
    console.log('Server started on http://localhost:' + port);
});