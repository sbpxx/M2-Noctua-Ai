const express = require('express');
const app = express();
const port = 8080;
const path = require('path');
const pool = require('./js/libraryBDD'); // Importer le pool de connexions
const jwt = require('jsonwebtoken');

const secretKey = 'your-256-bit-secret'; // Clé secrète pour signer les JWT

// Configurer le moteur de templates EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static('.'));
app.use(express.json());

app.get('/', function(req, res) {  
    res.render('accueil'); // Utiliser le template EJS pour la page d'accueil
});

app.get('/chat', function(req, res) {  
    res.render('chat'); // Utiliser le template EJS pour la page "cCat"
});



app.get('/images', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT path, idimage FROM image');
        res.json(result.rows);
        client.release(); // Libérer le client
    } catch (err) {
        console.error('Erreur lors de la récupération des images:', err.stack);
        res.status(500).send('Erreur lors de la récupération des images');
    }
});

app.get('/patrons', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT idpatron ,nom ,description ,idimage , datecreation ,nbfil ,path  FROM patron'); 
        res.json(result.rows); 
        client.release(); 
    } catch (err) {
        console.error('Erreur lors de la récupération des patrons:', err.stack);
        res.status(500).send('Erreur lors de la récupération des patrons');
    }
});

// Ajouter un utilisateur à la BDD
app.post('/register', async (req, res) => {
    try {
        console.log("Requête reçue pour ajouter un utilisateur");
        console.log("Corps de la requête:", req.body);

        const client = await pool.connect();

        // Vérifier si l'adresse e-mail est déjà utilisée
        const emailCheck = await client.query(
            'SELECT * FROM utilisateur WHERE email = $1',
            [req.body.email]
        );

        if (emailCheck.rows.length > 0) {
            console.log("Adresse e-mail déjà utilisée");
            res.status(400).json({ error: 'Adresse e-mail déjà utilisée' });
            client.release();
            return;
        }

        const result = await client.query(
            'INSERT INTO utilisateur (nom, email, mot_de_passe, datecreation) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.body.nom, req.body.email, req.body.mot_de_passe, new Date()]
        );

        console.log("Résultat de la requête:", result.rows);
        res.json(result.rows[0]);
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
            'SELECT * FROM utilisateur WHERE email = $1 AND mot_de_passe = $2',
            [req.body.email, req.body.password]
        );

        if (result.rows.length > 0) {
            console.log("Utilisateur trouvé:", result.rows[0]);
            const token = jwt.sign({ id: result.rows[0].id }, secretKey, { expiresIn: '1h' });
            res.status(200).json({ token });
        } else {
            // Regarder si le mail existe
            const emailCheck = await client.query(
                'SELECT * FROM utilisateur WHERE email = $1',
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
            'SELECT idutilisateur, nom, email, datecreation FROM utilisateur WHERE email = $1',
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

app.listen(port, () => {
    console.log('Server started on http://localhost:' + port);
});