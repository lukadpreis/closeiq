import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeMetrics, buildLabeledTranscript } from './metrics.js';

function readKeyFromEnv(keyName) {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.join(dir, '../.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(new RegExp(`^${keyName}=(.+)$`, 'm'));
    return match?.[1]?.trim() || process.env[keyName]?.trim();
  } catch {
    return process.env[keyName]?.trim();
  }
}

const ANTHROPIC_API_KEY = readKeyFromEnv('ANTHROPIC_API_KEY');
console.log('[claude] key loaded, length:', ANTHROPIC_API_KEY?.length, 'starts:', ANTHROPIC_API_KEY?.slice(0, 15));

let _client = null;
const client = () => {
  if (!_client) _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
};

// ── Step 1: Identify which speaker is the rep (fast, cheap call) ──────────────
async function identifyRepSpeaker(segments) {
  // Take first 3000 chars of transcript to identify speakers
  const sample = segments
    .slice(0, 40)
    .map(s => `[Speaker ${s.speaker}] (${s.start.toFixed(0)}s): ${s.text}`)
    .join('\n');

  const message = await client().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `Transcript excerpt (may be German or English):\n${sample}\n\nWhich speaker number is the sales rep / advisor? Reply with ONLY a single digit (0, 1, 2, ...).`
    }],
  });

  const raw = message.content[0].text.trim();
  const num = parseInt(raw.match(/\d+/)?.[0] || '0');
  console.log('[claude] identified rep speaker:', num);
  return isNaN(num) ? 0 : num;
}

// ── Step 2: Semantic analysis with labeled transcript ─────────────────────────
export async function analyzeCall({ transcript, segments, duration, prospect, company, outcome }) {
  // Step 1: Identify rep speaker
  const repSpeaker = await identifyRepSpeaker(segments);

  // Step 2: Compute metrics deterministically in Node.js
  const metrics = computeMetrics(segments, repSpeaker, duration);

  // Step 3: Build labeled transcript for Claude (REP vs KUNDE clearly marked)
  // Step 4: Detect language, then build labeled transcript
  const sampleText = segments.slice(0, 5).map(s => s.text).join(' ');
  const isEnglish = /\b(the|and|you|that|this|with|have|for|are)\b/i.test(sampleText);
  const lang = isEnglish ? 'EN' : 'DE';
  const kundeLabel = isEnglish ? 'CLIENT' : 'KUNDE';

  const labeledTranscript = buildLabeledTranscript(segments, repSpeaker, kundeLabel);

  const prompt = `You are analyzing a sales call transcript. The language is ${lang === 'EN' ? 'English' : 'German'}.
The transcript is labeled [REP] (sales rep/advisor) and [${kundeLabel}] (prospect/client).
Respond in the SAME LANGUAGE as the call (${lang === 'EN' ? 'English' : 'German'}) for all text fields except emailEN which is always English and emailDE always German.

VOLLSTÄNDIGES TRANSKRIPT:
${labeledTranscript}

METADATEN:
- Dauer: ${Math.round(duration / 60)} Minuten
- Prospect: ${prospect || 'Unbekannt'}
- Unternehmen: ${company || 'Unbekannt'}
- Ergebnis: ${outcome}

AUFGABE: Analysiere NUR die [KUNDE]-Zeilen für die semantische Extraktion. Ignoriere für keyData was der REP sagt — nur was der KUNDE von sich preisgibt zählt.

WICHTIG ZU FILLERWORDS: Durchsuche alle [REP]-Zeilen nach Hesitationslauten wie "ähm", "äh", "ehm", "eeh", "eehm", "hmm", "hm", "um", "uh", "uhh", "err". Zähle jeden Vorkommniss. Deepgram entfernt diese manchmal — schau trotzdem genau hin.

Gib folgendes JSON zurück (NUR JSON, kein Markdown):

{
  "repSpeaker": ${repSpeaker},
  "prospectSpeaker": ${repSpeaker === 0 ? 1 : 0},
  "fillerCountClaude": <Anzahl Hesitationslaute die du in [REP]-Zeilen gefunden hast. Schau nach: ähm, äh, ehm, eeh, eehm, hmm, hm, um, uh, uhh, err, er. Zähle jeden einzelnen Vorkommniss.>,
  "fillerBreakdownClaude": [{ "word": <Laut>, "count": <Anzahl> }],
  "score": <0-100 Gesamtscore. Berücksichtige: Talk-Ratio Rep=${metrics.talk.rep}% (ideal 40-50%), Fragen=${metrics.questions} (ideal >10), Unterbrechungen=${metrics.interruptions}, Avg Prospect Response=${metrics.avgProspectResponseLength} Wörter (höher=engagierter), Next-Step, Einwand-Handling-Qualität>,
  "nextStep": <true wenn KUNDE einem konkreten Folgetermin zugestimmt hat>,
  "followUpDate": <Datum/Zeit des nächsten Termins als String, nur aus KUNDE-Äußerungen, oder null>,
  "painPoints": [
    <MAX 5 Punkte: Kundenbezogene Unsicherheiten, Ängste, Bedenken aus [KUNDE]-Zeilen. z.B. "Unsicher ob monatlicher Beitrag langfristig leistbar", "Angst vor Vertragsbindung", "Zweifel ob Produkt zur aktuellen Lebenssituation passt". Keine allgemeinen Aussagen — konkret was der KUNDE geäußert hat>
  ],
  "objections": [
    {
      "label": <Einwand des KUNDEN — was genau sagte er?>,
      "count": <wie oft geäußert>,
      "type": <"price"|"timing"|"internal"|"competition"|"need">,
      "repResponse": <Was antwortete der REP darauf? Kurze Zusammenfassung>,
      "suggestion": <Was hätte der REP besser sagen können? Konkrete Alternative>
    }
  ],
  "jaCount": <Zähle NUR echte Zustimmungen aus [${kundeLabel}]-Zeilen. Zähle: "ja", "ok", "stimmt", "genau", "das macht Sinn", "klingt gut", "einverstanden", "yes", "sure", "agreed", "that works". NIEMALS [REP]-Zeilen mitzählen. Nur wenn der KUNDE einem Argument oder Vorschlag zustimmt>,
  "commitments": [<Explizite Zusagen aus [${kundeLabel}]-Zeilen: Termine die der KUNDE selbst bestätigt hat, Unterlagen die er schicken will, Entscheidungen die er getroffen hat. Max 5. Nur reale Commitments des KUNDEN, keine Vorschläge des Reps>],
  "questionsAnswered": <Von ${metrics.questions} Fragen des Reps: wie viele hat der KUNDE tatsächlich beantwortet? Zahl>,
  "trustScore": <0-100: Vertrauens/Rapport-Score basierend auf Sprache des KUNDEN — Offenheit, Zustimmung, Fragen, Engagement. 100=sehr offen und engagiert>,
  "emotionalSelling": <0-100: Anteil emotional-basierter Argumente des REPs. Emotional=Träume, Angst, Sicherheit, Familie, Zukunft. 0=rein rational/zahlenbasiert, 100=rein emotional>,
  "emotionalMoments": [
    {
      "moment": <Was genau sagte der REP? Direkte Aussage oder knappe Zusammenfassung>,
      "type": <"dream"|"fear"|"security"|"family"|"urgency">,
      "missed": <Was hätte er STATTDESSEN oder ZUSÄTZLICH sagen können um noch mehr emotionalen Wert zu erzeugen? Konkret>
    }
  ],
  "topics": [<3-7 Themen die besprochen wurden>],
  "keyData": {
    "berufsstatus": <Was sagt der KUNDE über seinen Beruf/Job/Studium? z.B. "Student im 3. Semester", "Angestellt als Ingenieur". Null wenn nie erwähnt>,
    "studiendauer": <Falls Student: konkrete Angabe wie lange noch. Null wenn nicht Student oder nicht erwähnt>,
    "investingErfahrung": <Hat der KUNDE Erfahrung mit ETF/Aktien/Fonds/Sparplänen erwähnt? Was genau? z.B. "Noch kein Depot", "ETF-Sparplan bei comdirect". Null wenn nie erwähnt>,
    "versicherungen": [<Jede vom KUNDEN erwähnte bestehende Versicherung: { "typ": "...", "anbieter": "..." oder null, "beitrag": "X€/Monat" oder null }>],
    "versicherungsInteresse": <Welches Produkt/Versicherung hat den KUNDEN interessiert oder wurde vereinbart? Konkret benennen>,
    "cashflow": <Freier monatlicher Betrag nach Ausgaben den der KUNDE erwähnt hat. Berechne aus Einkommen-Ausgaben wenn nicht direkt genannt. z.B. "ca. 500€/Monat frei">,
    "einkommen": <Konkretes Einkommen das der KUNDE genannt hat — Gehalt, Netto, BAföG, Stundenlohn. z.B. "3.000€ netto/Monat". Null wenn nie erwähnt>,
    "ausgaben": <Monatliche Kosten die der KUNDE erwähnt hat — Miete, Lebenshaltung. z.B. "Miete 800€, Rest ca. 600€">,
    "avBedarf": <Konkreter monatlicher Sparbetrag oder Einmalbetrag für Altersvorsorge der besprochen wurde. z.B. "150€/Monat über 30 Jahre">,
    "dreamPension": <Konkrete Rentenwunsch-Angabe des KUNDEN. z.B. "2.500€/Monat im Alter", "500.000€ Zielsumme">
  },
  "role": <Rolle/Beruf des Prospects in einem kurzen Satz>,
  "emailDE": <Follow-up Mail auf DEUTSCH. Betreff erste Zeile. Persönlich, konkrete Details aus dem Gespräch. NUR auf Basis von [KUNDE]-Aussagen — keine erfundenen Angaben>,
  "emailEN": <Gleicher Inhalt auf ENGLISCH>
}`;

  const message = await client().messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const semantic = JSON.parse(json);

  // Merge: Node.js metrics (accurate) + Claude semantics
  // For fillers: prefer Node.js count (from actual audio), fall back to Claude's text-based count
  const useClaudeFiller = metrics.fillers === 0 && (semantic.fillerCountClaude || 0) > 0;
  return {
    ...semantic,
    talk: metrics.talk,
    monologue: metrics.monologue,
    fillers: useClaudeFiller ? semantic.fillerCountClaude : metrics.fillers,
    fillerBreakdown: useClaudeFiller ? (semantic.fillerBreakdownClaude || []) : metrics.fillerBreakdown,
    questions: metrics.questions,
    prospectQ: metrics.prospectQ,
    prospectQuestions: metrics.prospectQuestions,
    unansweredQuestions: metrics.unansweredQuestions,
    priceTiming: metrics.priceTiming,
    interruptions: metrics.interruptions,
    avgMonologue: metrics.avgMonologue,
    avgProspectResponseLength: metrics.avgProspectResponseLength,
  };
}
