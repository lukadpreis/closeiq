import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import callsRouter from './routes/calls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url} content-type: ${req.headers['content-type']}`);
  next();
});

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api/calls', callsRouter);

// Serve built frontend for sharing
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => console.log(`CloseIQ backend running on http://localhost:${PORT}`));
