import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { extractAudio, transcribeAudio } from '../services/deepgram.js';
import { analyzeCall } from '../services/claude.js';
import { saveCall, getCalls, getCall, supabase } from '../services/supabase.js';

const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'audio/mp4', 'audio/mpeg', 'audio/m4a', 'video/quicktime', 'audio/x-m4a', 'video/webm'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mp3|m4a|mov|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Nur MP4, MP3, M4A und MOV Dateien werden unterstützt.'));
    }
  },
});

// POST /api/calls/analyze — upload + transcribe + analyze in one shot
router.post('/analyze', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    console.log(`[multer] err: ${err?.message || 'none'} | file: ${req.file?.originalname || 'MISSING'} | size: ${req.file?.size}`);
    if (err) return res.status(400).json({ error: `Multer: ${err.message}` });
    next();
  });
}, async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    const { prospect, company, outcome = 'follow-up' } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen.' });
    console.log(`[upload] ${req.file.originalname} ${(req.file.size/1024/1024).toFixed(1)}MB → ${req.file.path}`);

    // 1. Transcribe via Deepgram
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send('progress', { step: 1, label: 'Audio transkribieren…' });
    console.log('[step1] extracting audio with ffmpeg…');
    const audioPath = await extractAudio(tmpPath);
    const audioSize = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
    console.log(`[step1] audio extracted: ${audioSize}MB → sending to Deepgram`);
    const { transcript, segments, duration, words } = await transcribeAudio(audioPath);
    console.log('[step1] transcription done, duration:', duration);
    fs.unlink(audioPath, () => {});

    send('progress', { step: 2, label: 'Muster erkennen…' });
    send('progress', { step: 3, label: 'Einwände klassifizieren…' });

    // 2. Analyze via Claude
    const analysis = await analyzeCall({ transcript, segments, duration, prospect, company, outcome });

    send('progress', { step: 4, label: 'Zusammenfassung erstellen…' });

    // 3. Persist to Supabase
    const callRecord = {
      prospect: prospect || analysis.role || 'Unbekannt',
      company: company || 'Unbekannt',
      role: analysis.role || null,
      date: new Date().toLocaleString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      duration: Math.round(duration / 60),
      outcome,
      score: analysis.score,
      transcript,
      analysis,
    };
    // Store segments if column exists (added via migration)
    try { callRecord.segments = JSON.stringify(segments); } catch(_) {}

    const saved = await saveCall(callRecord);

    send('done', { call: { ...callRecord, id: saved.id } });
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
  }
});

// GET /api/calls — list all calls
router.get('/', async (req, res) => {
  try {
    const calls = await getCalls();
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/reanalyze — re-run Claude on existing transcript
router.post('/:id/reanalyze', async (req, res) => {
  try {
    const call = await getCall(req.params.id);
    if (!call?.transcript) return res.status(400).json({ error: 'Kein Transkript vorhanden.' });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send('progress', { label: 'Analyse läuft…' });

    // Recover segments from stored JSON, or reconstruct from transcript text
    let storedSegments = [];
    if (call.segments) {
      try {
        storedSegments = typeof call.segments === 'string'
          ? JSON.parse(call.segments)
          : call.segments;
      } catch (_) {}
    }

    // Fallback: parse transcript lines back into segments
    // Format: "[Speaker 0] (12.3s): text" or "[REP] (12s): text"
    if (!storedSegments || storedSegments.length === 0) {
      console.log('[reanalyze] no segments found, parsing from transcript text');
      const lines = (call.transcript || '').split('\n').filter(Boolean);
      let cursor = 0;
      storedSegments = lines.map(line => {
        const m = line.match(/\[(?:Speaker\s+)?(\d+|REP|KUNDE|CLIENT)\]\s*\((\d+(?:\.\d+)?)s\):\s*(.*)/i);
        if (!m) return null;
        const speakerRaw = m[1].toUpperCase();
        const speaker = speakerRaw === 'REP' ? 0 : speakerRaw === 'KUNDE' || speakerRaw === 'CLIENT' ? 1 : parseInt(m[1]);
        const start = parseFloat(m[2]);
        const text = m[3];
        const end = start + Math.max(text.split(' ').length * 0.4, 1); // estimate
        return { speaker, start, end, text };
      }).filter(Boolean);
      console.log(`[reanalyze] reconstructed ${storedSegments.length} segments from transcript`);
    }

    const analysis = await analyzeCall({
      transcript: call.transcript,
      segments: storedSegments,
      duration: (call.duration || 0) * 60,
      prospect: call.prospect,
      company: call.company,
      outcome: call.outcome,
    });

    const { data, error } = await supabase
      .from('calls').update({ analysis, score: analysis.score, role: analysis.role || call.role })
      .eq('id', req.params.id).select().single();
    if (error) throw new Error(error.message);

    send('done', { call: data });
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else { res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); }
  }
});

// POST /api/calls/:id/improve — generate improvement suggestions
router.post('/:id/improve', async (req, res) => {
  try {
    const call = await getCall(req.params.id);
    if (!call) return res.status(404).json({ error: 'Call nicht gefunden' });
    const a = call.analysis || {};

    const { analyzeCall } = await import('../services/claude.js');
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    function readKey() {
      try {
        const dir = path.default.dirname(fileURLToPath(import.meta.url));
        const content = fs.default.readFileSync(path.default.join(dir, '../.env'), 'utf8');
        const m = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        return m?.[1]?.trim();
      } catch { return process.env.ANTHROPIC_API_KEY; }
    }

    const client = new Anthropic({ apiKey: readKey() });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Du bist ein Sales Coach. Analysiere diese Call-Metriken und gib 3-4 konkrete, umsetzbare Verbesserungsvorschläge für den nächsten Call.

Metriken:
- Talk Ratio Rep: ${a.talk?.rep||'?'}% (Ideal: 40-50%)
- Prospect Talk: ${a.talk?.prospect||'?'}%
- Max Monolog: ${a.monologue||'?'} Min (Ideal: <3 Min)
- Filler Words: ${a.fillers||0} (Ideal: <10)
- Fragen gestellt: ${a.questions||0} (Ideal: >9)
- Prospect Fragen: ${a.prospectQ||0}
- Geholte Ja's: ${a.jaCount||0}
- Vertrauens-Score: ${a.trustScore||'?'}/100
- Emotional Selling: ${a.emotionalSelling||'?'}%
- Next Step: ${a.nextStep ? 'Ja' : 'Nein'}
- Unbeantwortete Fragen: ${a.unansweredQuestions?.length||0}

Wichtige Info: ${call.prospect} ist ${a.keyData?.berufsstatus||'unbekannt'}.

Antworte mit einem JSON Array von 3-4 Strings. Jeder String ist ein konkreter Verbesserungsvorschlag (1-2 Sätze, auf Deutsch). Nur JSON, kein Markdown.`
      }],
    });

    const raw = message.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const suggestions = JSON.parse(raw);
    res.json({ suggestions });
  } catch (err) {
    console.error('[improve]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calls/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('calls').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/calls/:id — update prospect/company/role/outcome
router.patch('/:id', async (req, res) => {
  try {
    const { prospect, company, role, outcome, analysis } = req.body;
    const updates = {};
    if (prospect !== undefined) updates.prospect = prospect;
    if (company  !== undefined) updates.company  = company;
    if (role     !== undefined) updates.role     = role;
    if (outcome  !== undefined) updates.outcome  = outcome;
    if (analysis !== undefined) updates.analysis = analysis;
    const { data, error } = await supabase.from('calls').update(updates).eq('id', req.params.id).select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/calls/:id/notes — save notes
router.patch('/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    console.log(`[notes] saving for ${req.params.id}: ${notes?.slice(0,50)}`);
    const { data, error } = await supabase
      .from('calls').update({ notes }).eq('id', req.params.id).select('id, notes').single();
    if (error) {
      console.error('[notes] supabase error:', error.message);
      throw new Error(error.message);
    }
    console.log('[notes] saved OK');
    res.json({ ok: true, notes: data.notes });
  } catch (err) {
    console.error('[notes] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/:id — get single call with full analysis
router.get('/:id', async (req, res) => {
  try {
    const call = await getCall(req.params.id);
    res.json(call);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
