const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const port = 8080;
const path = require('path');
const pool = require('./js/libraryBDD'); // Importer le pool de connexions
const jwt = require('jsonwebtoken');

const secretKey = 'your-256-bit-secret'; // Clé secrète pour signer les JWT
const OLLAMA_API_URL = 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = 'llama3.2';

// Configurer le moteur de templates EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static('.'));
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
            'SELECT id, name, email FROM "users" WHERE email = $1',
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

// Créer une discussion et stocker le premier message
app.post('/conversations', async (req, res) => {
    try {
        const { user_id, first_message } = req.body;
        const client = await pool.connect();

        const title = first_message.substring(0, 50);
        const conversationResult = await client.query(
            'INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *',
            [user_id, title]
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
        const client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.params.userId]
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
            const { conversationId, userId, message } = data;

            if (!conversationId || !message) {
                socket.emit('error', { message: 'Données invalides' });
                return;
            }

            const client = await pool.connect();

            try {
                // Vérifier si le message existe déjà 
                const existingMessage = await client.query(
                    'SELECT id FROM messages WHERE conversation_id = $1 AND sender = $2 AND content = $3 ORDER BY created_at DESC LIMIT 1',
                    [conversationId, 'user', message]
                );

                let shouldInsertUserMessage = true;
                if (existingMessage.rows.length > 0) {
                    // Le message existe déjà, ne pas le réinsérer
                    shouldInsertUserMessage = false;
                    console.log('Message utilisateur déjà existant, pas de réinsertion');
                }

                if (shouldInsertUserMessage) {
                    // Stocker le message utilisateur
                    await client.query(
                        'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW())',
                        [conversationId, 'user', message]
                    );

                    // Mettre à jour la conversation
                    await client.query(
                        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
                        [conversationId]
                    );

                    // Émettre le message utilisateur à la room
                    io.to(`conversation-${conversationId}`).emit('receive-message', {
                        sender: 'user',
                        content: message,
                        created_at: new Date()
                    });
                }

                // Récupérer l'historique pour le contexte
                const historyResult = await client.query(
                    'SELECT sender, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
                    [conversationId]
                );

                // Construire le contexte pour Ollama (limiter à 20 derniers messages)
                let messages = historyResult.rows.map(row => ({
                    role: row.sender === 'user' ? 'user' : 'assistant',
                    content: row.content
                }));

                // Limiter le contexte pour éviter de dépasser la fenêtre
                if (messages.length > 20) {
                    messages = messages.slice(-20);
                }

                // Appeler l'API Ollama
                let aiMessage;
                try {
                    console.log('Calling Ollama API...');
                    const ollamaResponse = await axios.post(OLLAMA_API_URL, {
                        model: OLLAMA_MODEL,
                        messages: messages,
                        stream: false
                    }, {
                        timeout: 60000
                    });

                    aiMessage = ollamaResponse.data.message.content;
                    console.log('Ollama response received');

                } catch (ollamaError) {
                    console.error('Ollama API error:', ollamaError.message);
                    aiMessage = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
                }

                // Stocker la réponse IA
                await client.query(
                    'INSERT INTO messages (conversation_id, sender, content, created_at) VALUES ($1, $2, $3, NOW())',
                    [conversationId, 'bot', aiMessage]
                );

                // Mettre à jour la conversation à nouveau
                await client.query(
                    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
                    [conversationId]
                );

                // Émettre la réponse IA à la room
                io.to(`conversation-${conversationId}`).emit('receive-message', {
                    sender: 'bot',
                    content: aiMessage,
                    created_at: new Date()
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