/**
 * CloseIQ — Metrics Engine
 * All metrics computed deterministically from Deepgram diarized segments.
 * Speaker identification is done by Claude (repSpeaker number passed in).
 */

// ── Filler patterns — elongated hesitation sounds only ──────────────────────
const FILLER_PATTERNS = [
  { label: 'ähm/äh',  regex: /\b(ä+h+m*|ae+h+m*)\b/gi },
  { label: 'ehm/eeh', regex: /\b(e{2,}h*m*|eh+m+)\b/gi },
  { label: 'öhm/öh',  regex: /\b(ö+h+m*)\b/gi },
  { label: 'hmm/hm',  regex: /\b(h{1,2}m{2,}|hm)\b/gi },
  { label: 'um/umm',  regex: /\b(u{1,2}m{1,4})\b/gi },
  { label: 'uh/uhh',  regex: /\b(u{1,2}h{1,3})\b/gi },
  { label: 'er/err',  regex: /\b(e{1,2}r{1,3})\b/gi },
];

// ── Question word lists ──────────────────────────────────────────────────────
// German question words + inverted-verb question starters
const DE_OPEN_Q   = /^(was|wie|wann|warum|weshalb|wieso|wofür|womit|wohin|woher|wo|wer|wen|wem|wessen|welche[rs]?|welchen|inwiefern|inwieweit)\b/i;
const DE_CLOSED_Q = /^(hast|haben|hat|habt|bist|sind|ist|seid|war|wäre|wären|würde[st]?|können|kannst|kann|könntest|könnte[n]?|sollte[st]?|soll|darf|darfst|dürfte[n]?|magst|möchtest|möchte|machst|macht|machen|gehst|geht|gehen|nimmst|nimmt|glaubst|glaubt|siehst|weißt|kennst|brauchst|denkst|dachtest|überlegst)\b/i;
const EN_Q        = /^(what|how|when|why|where|who|which|whom|whose|would|could|should|did|do|does|is|are|was|were|can|have|has|will|shall|may|might|won't|don't|doesn't|didn't|haven't|hasn't|aren't|isn't|wasn't|weren't|couldn't|wouldn't|shouldn't)\b/i;

// Short confirmatory/rhetorical tails to EXCLUDE even if 5+ words
const CONFIRM_TAILS = /\b(right\??|correct\??|ok\??|okay\??|yeah\??|ja\??|nein\??|ne\??|stimmt\??|genau\??|klar\??|alright\??|you know\??|makes sense\??|you with me\??|got it\??|see what i mean\??|following me\??|does that make sense\??)\s*$/i;

/**
 * Split a segment's text into individual sentences.
 * Handles mid-utterance punctuation from Deepgram.
 */
function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Determine if a sentence is a genuine question asked by the rep.
 */
function isGenuineQuestion(sentence) {
  const s = sentence.trim();
  if (!s.includes('?')) return false;
  const words = s.split(/\s+/);
  if (words.length < 5) return false;                // Too short
  if (CONFIRM_TAILS.test(s)) return false;           // Confirmatory tail
  return DE_OPEN_Q.test(s) || DE_CLOSED_Q.test(s) || EN_Q.test(s);
}

// ── Main metrics computation ─────────────────────────────────────────────────
export function computeMetrics(segments, repSpeaker, totalDuration) {
  if (!segments || segments.length === 0) {
    return {
      talk: { rep: 50, prospect: 50 },
      monologue: 0, avgMonologue: 0,
      fillers: 0, fillerBreakdown: [],
      questions: 0, prospectQ: 0,
      prospectQuestions: [], unansweredQuestions: [],
      priceTiming: 0,
      interruptions: 0,
      avgProspectResponseLength: 0,
    };
  }

  const prospectSpeaker = repSpeaker === 0 ? 1 : 0;
  const repSegs      = segments.filter(s => s.speaker === repSpeaker);
  const prospectSegs = segments.filter(s => s.speaker === prospectSpeaker);

  // ── Talk ratio ─────────────────────────────────────────────────────────────
  const dur = (s) => Math.max((s.end || 0) - (s.start || 0), 0);
  const repDur      = repSegs.reduce((acc, s) => acc + dur(s), 0);
  const prospectDur = prospectSegs.reduce((acc, s) => acc + dur(s), 0);
  const totalDur    = repDur + prospectDur || 1;
  const talkRep      = Math.round((repDur / totalDur) * 100);
  const talkProspect = 100 - talkRep;

  // ── Monologue (max & avg continuous rep blocks) ────────────────────────────
  let maxBlock = 0, curBlock = 0, blockCount = 0, blockSum = 0;
  for (const seg of segments) {
    if (seg.speaker === repSpeaker) {
      curBlock += dur(seg);
    } else {
      if (curBlock > 0) {
        maxBlock = Math.max(maxBlock, curBlock);
        blockSum += curBlock;
        blockCount++;
        curBlock = 0;
      }
    }
  }
  if (curBlock > 0) { maxBlock = Math.max(maxBlock, curBlock); blockSum += curBlock; blockCount++; }
  const monologue    = Math.round((maxBlock / 60) * 10) / 10;
  const avgMonologue = blockCount ? Math.round((blockSum / blockCount / 60) * 10) / 10 : 0;

  // ── Filler words ───────────────────────────────────────────────────────────
  const repText = repSegs.map(s => s.text.toLowerCase()).join(' ');
  const fillerBreakdown = [];
  for (const { label, regex } of FILLER_PATTERNS) {
    regex.lastIndex = 0;
    const m = repText.match(regex);
    if (m?.length) fillerBreakdown.push({ word: label, count: m.length });
  }
  fillerBreakdown.sort((a, b) => b.count - a.count);
  const fillers = fillerBreakdown.reduce((s, f) => s + f.count, 0);

  // ── Questions — sentence-level, strict criteria ────────────────────────────
  // Rep questions
  const repQuestions = [];
  for (const seg of repSegs) {
    for (const sentence of splitSentences(seg.text)) {
      if (isGenuineQuestion(sentence)) {
        repQuestions.push({ text: sentence, segStart: seg.start, segIdx: segments.indexOf(seg) });
      }
    }
  }

  // Prospect questions
  const prospectQList = [];
  for (const seg of prospectSegs) {
    for (const sentence of splitSentences(seg.text)) {
      if (isGenuineQuestion(sentence)) prospectQList.push(sentence);
    }
  }

  // ── Unanswered questions ───────────────────────────────────────────────────
  // A question is "unanswered" if:
  // - The next prospect segment is absent, OR
  // - The next prospect segment is < 8 words (pure acknowledgment), OR
  // - The next segment is again from the rep (prospect never spoke)
  const SHORT_RESPONSE = /^(ok|okay|ja|jj|nein|no|yes|alright|sure|klar|stimmt|genau|mhm|hmm|ah|oh|right|uh|um|i see|okay|got it|understood|verstehe|alles klar)\b/i;
  const unansweredQuestions = [];

  for (const { text, segIdx } of repQuestions) {
    // Find the next segment after this rep question segment
    let nextProspectSeg = null;
    for (let i = segIdx + 1; i < Math.min(segIdx + 4, segments.length); i++) {
      if (segments[i].speaker === prospectSpeaker) { nextProspectSeg = segments[i]; break; }
    }
    if (!nextProspectSeg) {
      unansweredQuestions.push(text);
    } else {
      const words = nextProspectSeg.text.split(/\s+/).length;
      const isAck = SHORT_RESPONSE.test(nextProspectSeg.text.trim()) && words < 6;
      if (isAck) unansweredQuestions.push(text);
    }
  }

  // ── Interruptions ──────────────────────────────────────────────────────────
  // Count how many times the rep starts speaking within 0.5s of the prospect finishing
  let interruptions = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    if (prev.speaker === prospectSpeaker && curr.speaker === repSpeaker) {
      const gap = (curr.start || 0) - (prev.end || 0);
      if (gap < 0.5 && gap > -2) interruptions++; // overlap or very quick takeover
    }
  }

  // ── Average prospect response length ──────────────────────────────────────
  const prospectWordCounts = prospectSegs.map(s => s.text.split(/\s+/).length);
  const avgProspectResponseLength = prospectWordCounts.length
    ? Math.round(prospectWordCounts.reduce((a, b) => a + b, 0) / prospectWordCounts.length)
    : 0;

  // ── Price timing ──────────────────────────────────────────────────────────
  const PRICE_KW = /\b(euro|€|\$|£|preis|kosten|beitrag|zahlen|monatlich|rate|betrag|budget|kostet|gebühr|tarif|summe|price|cost|fee|payment|monthly|invest|charge|dollar|per month|annually)\b/i;
  let priceTiming = 0;
  for (const seg of segments) {
    if (PRICE_KW.test(seg.text)) {
      priceTiming = Math.round(((seg.start || 0) / (totalDuration || 1)) * 100);
      break;
    }
  }

  return {
    talk: { rep: talkRep, prospect: talkProspect },
    monologue,
    avgMonologue,
    fillers,
    fillerBreakdown,
    questions: repQuestions.length,
    prospectQ: prospectQList.length,
    prospectQuestions: prospectQList.slice(0, 8),
    unansweredQuestions: unansweredQuestions.slice(0, 8),
    priceTiming,
    interruptions,
    avgProspectResponseLength,
  };
}

/**
 * Build speaker-labeled transcript for Claude.
 */
export function buildLabeledTranscript(segments, repSpeaker, clientLabel = 'KUNDE') {
  return segments
    .map(s => {
      const label = s.speaker === repSpeaker ? '[REP]' : `[${clientLabel}]`;
      return `${label} (${s.start.toFixed(0)}s): ${s.text}`;
    })
    .join('\n');
}
