import { extractAudioTrack, EXTRACTION_THRESHOLD_BYTES, MAX_PROCESSABLE_BYTES } from './audioExtract.js';

// In production (served from backend), API is on same origin
// In dev (Vite proxy), also /api works
const BASE = '/api';

export async function fetchCalls() {
  const res = await fetch(`${BASE}/calls`);
  if (!res.ok) throw new Error('Fehler beim Laden der Calls');
  return res.json();
}

export async function fetchCall(id) {
  const res = await fetch(`${BASE}/calls/${id}`);
  if (!res.ok) throw new Error('Call nicht gefunden');
  return res.json();
}

export async function deleteCall(id) {
  const res = await fetch(`${BASE}/calls/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Löschen fehlgeschlagen');
  return res.json();
}

export async function updateCall(id, data) {
  const res = await fetch(`${BASE}/calls/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Update fehlgeschlagen');
  return res.json();
}

export function reanalyzeCall(id, onProgress) {
  return new Promise((resolve, reject) => {
    fetch(`${BASE}/calls/${id}/reanalyze`, { method: 'POST' })
      .then(res => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        function pump() {
          reader.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();
            for (const part of parts) {
              const lines = part.split('\n');
              const eventLine = lines.find(l => l.startsWith('event:'));
              const dataLine = lines.find(l => l.startsWith('data:'));
              if (!eventLine || !dataLine) continue;
              const event = eventLine.slice(7).trim();
              const data = JSON.parse(dataLine.slice(5).trim());
              if (event === 'progress') onProgress(data);
              else if (event === 'done') resolve(data.call);
              else if (event === 'error') reject(new Error(data.error));
            }
            pump();
          }).catch(reject);
        }
        pump();
      }).catch(reject);
  });
}

export async function saveNotes(id, notes) {
  const res = await fetch(`${BASE}/calls/${id}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error('Notiz konnte nicht gespeichert werden');
  return res.json();
}

// Upload file directly to Supabase Storage using a signed URL from the backend.
// Returns a Promise<storagePath>.
function uploadToStorage(file, onUploadProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Get a signed upload URL from our backend
      const urlRes = await fetch(`${BASE}/calls/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.error || 'Upload-URL konnte nicht erstellt werden');
      }
      const { uploadUrl, storagePath } = await urlRes.json();

      // 2. Upload directly to Supabase Storage using XHR (supports progress events)
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onUploadProgress) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onUploadProgress(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(storagePath);
        } else {
          reject(new Error(`Storage Upload fehlgeschlagen: HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Netzwerkfehler beim Hochladen'));
      xhr.ontimeout = () => reject(new Error('Upload Timeout'));

      xhr.send(file);
    } catch (err) {
      reject(err);
    }
  });
}

// Analyzes a call: uploads file to storage, then streams SSE analysis from backend.
export function analyzeCallStream({ file, prospect, company, outcome }, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      let uploadFile = file;

      // Phase 0: Extract & compress audio in-browser for large video files.
      // This keeps uploads well under Supabase's 50MB free-tier limit and
      // is dramatically faster (a 1h call shrinks from ~1-8GB to ~25MB).
      const isAlreadyAudio = /\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name);
      if (file.size > EXTRACTION_THRESHOLD_BYTES && !isAlreadyAudio) {
        if (file.size > MAX_PROCESSABLE_BYTES) {
          throw new Error(
            `Datei ist mit ${(file.size/1024/1024/1024).toFixed(1)}GB zu groß für die Verarbeitung im Browser (Limit: ${(MAX_PROCESSABLE_BYTES/1024/1024/1024).toFixed(0)}GB). ` +
            `Bitte exportiere nur die Audiospur oder komprimiere die Aufnahme vorher (z.B. mit HandBrake) und lade sie erneut hoch.`
          );
        }
        onProgress({ step: 0, label: 'Audio wird extrahiert… 0%', pct: 0 });
        uploadFile = await extractAudioTrack(file, (pct) => {
          onProgress({ step: 0, label: `Audio wird extrahiert… ${pct}%`, pct });
        });
        console.log(`[api] extracted audio: ${(uploadFile.size/1024/1024).toFixed(1)}MB (from ${(file.size/1024/1024).toFixed(1)}MB)`);
      }

      // Phase 1: Upload to Supabase Storage directly (bypasses Express size limits)
      onProgress({ step: 1, label: 'Datei wird hochgeladen… 0%', pct: 0 });
      const storagePath = await uploadToStorage(uploadFile, (pct) => {
        onProgress({ step: 1, label: `Datei wird hochgeladen… ${pct}%`, pct });
      });

      // Phase 2: Tell backend to process from storage path (SSE stream)
      onProgress({ step: 2, label: 'Datei wird vorbereitet…' });
      const res = await fetch(`${BASE}/calls/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, prospect, company, outcome }),
      });

      console.log('[api] status:', res.status, 'ok:', res.ok, 'type:', res.headers.get('content-type'));
      if (!res.ok) return res.json().then(e => { throw new Error(e.error || 'Analyse fehlgeschlagen'); });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop();
          for (const part of parts) {
            const lines = part.split('\n');
            const eventLine = lines.find(l => l.startsWith('event:'));
            const dataLine = lines.find(l => l.startsWith('data:'));
            if (!eventLine || !dataLine) continue;
            const event = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(5).trim());
            if (event === 'progress') onProgress(data);
            else if (event === 'done') resolve(data.call);
            else if (event === 'error') reject(new Error(data.error));
          }
          pump();
        }).catch(reject);
      }
      pump();
    } catch (err) {
      reject(err);
    }
  });
}
