import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const pool = mysql.createPool({
    host: 'localhost', 
    user: 'root', 
    password: '', 
    database: 'boscochat', 
    port: 3307 
});

// Función obligatoria para obtener el conteo
async function getUserQueryCount(userId) {
    try {
        const [rows] = await pool.execute('SELECT query_count FROM users WHERE id = ?', [userId]);
        return rows.length > 0 ? rows[0].query_count : 0;
    } catch (err) { return 0; }
}

// LOGIN: Devuelve el objeto usuario para que 'setUser' funcione
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
    if (rows.length > 0) res.json(rows[0]);
    else res.status(401).send();
});

// REGISTRO
app.post('/api/register', async (req, res) => {
    const { name, email, password, terms } = req.body;
    if (!terms) return res.status(400).send();
    await pool.execute('INSERT INTO users (name, email, password, role, accepted_policy) VALUES (?, ?, ?, "free", 1)', [name, email, password]);
    res.json({ success: true });
});

// BUSCADOR CON CONTEO (SHADOW MODE)
app.get('/api/search', async (req, res) => {
    const { q, userId } = req.query;
    if (userId && userId !== 'null') {
        await pool.execute('UPDATE users SET query_count = query_count + 1 WHERE id = ?', [userId]);
        const count = await getUserQueryCount(userId);
        console.log(`Usuario ${userId} - Consultas: ${count}`);
    }
    const [rows] = await pool.execute(
        `SELECT d.title, p.text_content, p.page_number FROM pages p JOIN documents d ON p.document_id = d.id WHERE p.text_content LIKE ?`, 
        [`%${q}%`]
    );
    res.json(rows);
});

// SUBIR DOC (ADMIN)
app.post('/api/admin/upload-doc', async (req, res) => {
    const { title, content, page } = req.body;
    const [doc] = await pool.execute('INSERT INTO documents (title) VALUES (?) ON DUPLICATE KEY UPDATE title=title', [title]);
    const docId = doc.insertId || 1; 
    await pool.execute('INSERT INTO pages (document_id, text_content, page_number) VALUES (?, ?, ?)', [docId, content, page]);
    res.json({ success: true });
});

// ACTUALIZAR ROL
app.post('/api/update-role', async (req, res) => {
    const { userId, newRole } = req.body;
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', [newRole, userId]);
    res.json({ success: true });
});

app.listen(3000, () => console.log("Servidor BoscoChat activo"));