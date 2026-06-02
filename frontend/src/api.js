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

// Returns a ReadableStream of SSE events from the backend
export function analyzeCallStream({ file, prospect, company, outcome }, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    if (prospect) formData.append('prospect', prospect);
    if (company) formData.append('company', company);
    formData.append('outcome', outcome);

    fetch(`${BASE}/calls/analyze`, { method: 'POST', body: formData })
      .then(res => {
        console.log('[api] status:', res.status, 'ok:', res.ok, 'type:', res.headers.get('content-type'));
        if (!res.ok) return res.json().then(e => { throw new Error(e.error || 'Upload fehlgeschlagen'); });
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
      })
      .catch(reject);
  });
}
