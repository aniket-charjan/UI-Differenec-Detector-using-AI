import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { router as apiRouter } from './routes/api.js';
import { initDatabase } from './db.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDatabase()
  .then(() => console.log('Database initialized & Tables Created Successfully'))
  .catch(err => console.error('Database initialization error:', err));

// Routes, currently now using any auth scheme, hence no middleware for auth
app.use('/api', apiRouter);

// Serve a simple frontend for testing
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
