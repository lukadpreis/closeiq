import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import callsRouter from './routes/calls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes first
app.use('/api/calls', callsRouter);

app.get('/health', (_, res) => {
  const publicDir = path.join(__dirname, 'public');
  const files = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];
  res.json({ ok: true, __dirname, publicDir, files });
});

// Frontend static files
const publicDir = path.join(__dirname, 'public');
const indexHtml = path.join(publicDir, 'index.html');

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// All other routes → serve index.html
app.use((req, res) => {
  if (fs.existsSync(indexHtml)) {
    const content = fs.readFileSync(indexHtml, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(content);
  } else {
    res.json({ status: 'API ok', indexHtml, exists: false });
  }
});

app.listen(PORT, () => console.log(`CloseIQ backend on port ${PORT}`));
