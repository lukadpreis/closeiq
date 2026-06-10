import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import http from 'http';
import { extractAudio, transcribeAudio } from '../services/deepgram.js';
import { analyzeCall } from '../services/claude.js';
import { saveCall, getCalls, getCall, supabase } from '../services/supabase.js';

const router = express.Router();

// ─── Helper: stream a URL to a local temp file ────────────────────────────────
function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`Storage download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

// ─── POST /api/calls/upload-url — generate a signed upload URL ───────────────
// Frontend calls this first, then uploads the file DIRECTLY to Supabase Storage.
// This bypasses the Express server for the large file transfer entirely.
router.post('/upload-url', express.json(), async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const safeName = filename.replace(/[^a-z0-9.\-_]/gi, '_');
    const storagePath = `calls/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from('call-recordings')
      .createSignedUploadUrl(storagePath);

    if (error) throw new Error(`Signed URL error: ${error.message}`);

    res.json({ uploadUrl: data.signedUrl, storagePath });
  } catch (err) {
    console.error('[upload-url]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/calls/analyze — download from storage, transcribe, analyze ────
router.post('/analyze', express.json({ limit: '1mb' }), async (req, res) => {
  const { storagePath, prospect, company, outcome = 'follow-up' } = req.body;
  if (!storagePath) return res.status(400).json({ error: 'storagePath required' });

  // Start SSE immediately so the client knows we're working
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const tmpPath = path.join(os.tmpdir(), `ciq-video-${Date.now()}.tmp`);
  let audioPath = null;

  try {
    // 1. Download video from Supabase Storage to tmp
    send('progress', { step: 1, label: 'Datei wird vorbereitet…' });
    console.log(`[analyze] downloading ${storagePath} from storage…`);

    const { data: signed, error: urlErr } = await supabase.storage
      .from('call-recordings')
      .createSignedUrl(storagePath, 300); // 5-min URL for internal download
    if (urlErr) throw new Error(`Storage signed URL: ${urlErr.message}`);

    await downloadToFile(signed.signedUrl, tmpPath);
    console.log(`[analyze] downloaded to ${tmpPath} (${(fs.statSync(tmpPath).size/1024/1024).toFixed(1)}MB)`);

    // 2. Extract & transcribe audio
    send('progress', { step: 2, label: 'Audio transkribieren…' });
    console.log('[step1] extracting audio with ffmpeg…');
    audioPath = await extractAudio(tmpPath);
    const audioSize = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
    console.log(`[step1] audio extracted: ${audioSize}MB → sending to Deepgram`);
    const { transcript, segments, duration, words } = await transcribeAudio(audioPath);
    console.log('[step1] transcription done, duration:', duration);

    send('progress', { step: 3, label: 'Muster erkennen…' });
    send('progress', { step: 4, label: 'Einwände klassifizieren…' });

    // 3. Analyze via Claude
    const analysis = await analyzeCall({ transcript, segments, duration, prospect, company, outcome });

    send('progress', { step: 5, label: 'Zusammenfassung erstellen…' });

    // 4. Persist to Supabase
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
    try { callRecord.segments = JSON.stringify(segments); } catch(_) {}

    const saved = await saveCall(callRecord);

    // 5. Cleanup storage
    supabase.storage.from('call-recordings').remove([storagePath]).catch(() => {});

    send('done', { call: { ...callRecord, id: saved.id } });
    res.end();
  } catch (err) {
    console.error('[analyze]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    if (audioPath) fs.unlink(audioPath, () => {});
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

    let storedSegments = [];
    if (call.segments) {
      try {
        storedSegments = typeof call.segments === 'string'
          ? JSON.parse(call.segments)
          : call.segments;
      } catch (_) {}
    }

    if (!storedSegments || storedSegments.length === 0) {
      console.log('[reanalyze] no segments found, parsing from transcript text');
      const lines = (call.transcript || '').split('\n').filter(Boolean);
      storedSegments = lines.map(line => {
        const m = line.match(/\[(?:Speaker\s+)?(\d+|REP|KUNDE|CLIENT)\]\s*\((\d+(?:\.\d+)?)s\):\s*(.*)/i);
        if (!m) return null;
        const speakerRaw = m[1].toUpperCase();
        const speaker = speakerRaw === 'REP' ? 0 : speakerRaw === 'KUNDE' || speakerRaw === 'CLIENT' ? 1 : parseInt(m[1]);
        const start = parseFloat(m[2]);
        const text = m[3];
        const end = start + Math.max(text.split(' ').length * 0.4, 1);
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
    const transcriptSample = (call.transcript || '')
      .split('\n')
      .filter(l => l.includes('[REP]') || l.includes('[KUNDE]') || l.includes('[CLIENT]'))
      .slice(0, 60)
      .join('\n');

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Du bist ein erfahrener Sales Coach. Analysiere DIESEN SPEZIFISCHEN Call und gib 3-4 sehr konkrete Verbesserungsvorschläge.

WICHTIG: Beziehe dich auf konkrete Momente aus dem Transkript — nenne was tatsächlich gesagt wurde, nicht allgemeine Regeln.

Call: ${call.prospect} (${a.keyData?.berufsstatus||'unbekannt'}) · ${call.duration} Min
Sprache: ${transcriptSample.includes('[CLIENT]') ? 'Englisch' : 'Deutsch'}

Metriken aus diesem Call:
- Rep Redeanteil: ${a.talk?.rep||'?'}% → Prospect nur ${a.talk?.prospect||'?'}%
- Längster Monolog: ${a.monologue||'?'} Min
- Filler Words: ${a.fillers||0}
- Rep Fragen: ${a.questions||0}
- Prospect Kaufsignal-Fragen: ${a.prospectQ||0}
- Vertrauen: ${a.trustScore||'?'}/100
- Unbeantwortete Kundenfragen: ${(a.unansweredQuestions||[]).join('; ') || 'keine'}
- Wichtige Infos über Kunden: ${[a.keyData?.einkommen, a.keyData?.cashflow, a.keyData?.dreamPension].filter(Boolean).join(', ') || 'unbekannt'}
- Einwände: ${(a.objections||[]).map(o=>o.label).join(', ') || 'keine'}
- Pain Points: ${(a.painPoints||[]).join('; ')}

Transkript-Ausschnitt:
${transcriptSample}

Gib ein JSON Array mit GENAU 3-4 Strings zurück. Jeder String:
- Bezieht sich auf einen KONKRETEN Moment oder eine konkrete Aussage aus dem Transkript
- Nennt was besser hätte gemacht werden können und WIE (konkretes Beispiel)
- Ist spezifisch für DIESEN Call, DIESEN Kunden — keine generischen Verkaufsregeln
- Max 2 Sätze pro Punkt
Nur JSON, kein Markdown.`
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
