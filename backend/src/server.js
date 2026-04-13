import express from 'express';
import cors from 'cors';
import usersRoutes from './routes/users.js';

const app = express();

// MIDDLEWARES
app.use(cors());
app.use(express.json());

// RUTAS
app.use('/users', usersRoutes);

// TEST
app.get('/', (req, res) => {
  res.send('API funcionando');
});

// PUERTO
app.listen(3000, () => {
  console.log('Backend corriendo en http://localhost:3000');
});