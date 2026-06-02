import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import callsRouter from './routes/calls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => {
  const p1 = path.join(__dirname, 'public');
  const p2 = path.join(__dirname, '../frontend/dist');
  res.json({
    ok: true,
    __dirname,
    p1_exists: existsSync(path.join(p1, 'index.html')),
    p2_exists: existsSync(path.join(p2, 'index.html')),
  });
});

app.use('/api/calls', callsRouter);

// Serve frontend — try both possible paths
const frontendDist = existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '../frontend/dist');

app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  const indexFile = path.join(frontendDist, 'index.html');
  if (existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.json({ status: 'CloseIQ API running', frontendDist, note: 'Frontend not found' });
  }
});

app.listen(PORT, () => console.log(`CloseIQ backend running on http://localhost:${PORT}`));
