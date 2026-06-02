# CloseIQ — Sales Call Tracker

## Stack
- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Transcription**: Deepgram (Nova-2, Speaker Diarization)
- **Analysis**: Claude claude-opus-4-8
- **Database**: Supabase (PostgreSQL)

## Setup

### 1. Supabase
1. Neues Projekt auf [supabase.com](https://supabase.com) anlegen
2. SQL Editor öffnen und `supabase_schema.sql` ausführen
3. `Project URL` und `service_role` Key aus Settings → API kopieren

### 2. API Keys
- **Deepgram**: [console.deepgram.com](https://console.deepgram.com) → Create API Key
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com) → API Keys

### 3. Backend starten
```bash
cd backend
cp .env.example .env
# .env mit deinen Keys befüllen
npm install
npm run dev
```

### 4. Frontend starten
```bash
cd frontend
npm install
npm run dev
# öffnet http://localhost:5173
```

## Workflow
1. Teams-Call aufnehmen (Teams → Aufzeichnung starten)
2. MP4-Datei lokal speichern
3. In CloseIQ → „+ Neuer Call" → Datei hochladen
4. Prospect-Name, Unternehmen, Ergebnis eingeben
5. „Call analysieren" klicken
6. ~60–120s warten (Deepgram + Claude)
7. Detailanalyse mit Score, Metriken, Pain Points, Follow-up Mail abrufen

## Umgebungsvariablen (backend/.env)
| Variable | Beschreibung |
|---|---|
| `DEEPGRAM_API_KEY` | Deepgram API Key |
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (nicht anon!) |
| `PORT` | Backend Port (default: 3001) |
| `FRONTEND_URL` | CORS Origin (default: http://localhost:5173) |
