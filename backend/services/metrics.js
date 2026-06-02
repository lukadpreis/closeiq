/**
 * CloseIQ — Metrics Engine
 * Deterministic metrics from Deepgram diarized segments.
 * repSpeaker is identified by Claude before this runs.
 */

// ── Filler patterns — isolated hesitation sounds only ────────────────────────
// Use (?<!\w) and (?!\w) instead of \b to avoid matching inside normal words
// like "forum", "museum", "summer" etc.
const FILLER_PATTERNS = [
  // German
  { label: 'ähm/äh',  regex: /(?<![a-zA-ZäöüÄÖÜ])(ä+h+m*|ae+h+m*)(?![a-zA-ZäöüÄÖÜ])/gi },
  { label: 'ehm/eeh', regex: /(?<![a-zA-Z])(e{2,}h+m*|eh{2,}m*)(?![a-zA-Z])/gi },
  { label: 'öhm/öh',  regex: /(?<![a-zA-ZöÖ])(ö+h+m*)(?![a-zA-ZöÖ])/gi },
  { label: 'hmm/hm',  regex: /(?<![a-zA-Z])(h{1,2}m{2,})(?![a-zA-Z])/gi },
  // English — only match as standalone utterances (surrounded by spaces/punctuation)
  // 'um' standalone: must not be part of a real word
  { label: 'um/umm',  regex: /(?<=\s|^|[,.])\b(umm{1,3}|um)\b(?=\s|$|[,.])/gi },
  { label: 'uh/uhh',  regex: /(?<=\s|^|[,.])\b(uhh{1,2}|uh)\b(?=\s|$|[,.])/gi },
  { label: 'er/err',  regex: /(?<=\s|^|[,.])\b(err+)\b(?=\s|$|[,.])/gi },
];

// ── Question classifiers ──────────────────────────────────────────────────────
const DE_OPEN   = /^(was|wie|wann|warum|weshalb|wieso|wofür|womit|wohin|woher|wo|wer|wen|wem|wessen|welche[rs]?|welchen|inwiefern|inwieweit)\b/i;
const DE_CLOSED = /^(hast|haben|hat|bist|sind|ist|war|wäre|würde[st]?|können|kannst|kann|könntest|sollte[st]?|soll|darf|dürfte|magst|möchtest|machst|macht|glaubst|weißt|kennst|brauchst|denkst)\b/i;
const EN_Q      = /^(what|how|when|why|where|who|which|whom|whose|would|could|should|did|do|does|is|are|was|were|can|have|has|will|may|might)\b/i;

// Generic confirmatory tails — exclude from both rep AND prospect questions
const CONFIRM_TAILS = /\b(right\??|correct\??|ok\??|okay\??|yeah\??|ja\??|ne\??|stimmt\??|genau\??|alright\??|you know\??|makes sense\??|following me\??|does that make sense\??|do you understand\??|have you heard of (it|that)\??|is that clear\??|are you (sure|good|okay)\??)\s*$/i;

// Generic understanding checks — filter FROM PROSPECT questions (not buying signals)
const GENERIC_PROSPECT_Q = /^(do you understand|have you heard|do you know|is it okay|can you (repeat|explain|tell)|did you (say|mean)|what do you mean|sorry|i see what|that makes sense)/i;

// Buying-signal keywords — these make a question more valuable from the prospect
const BUYING_SIGNAL = /\b(cost|price|fee|invest|worth|benefit|advantage|compare|better than|different|guarantee|long|start|begin|monthly|annual|how much|what happens|risk|return|explain|why (should|would|is)|how does it work|what (do i|would i)|when (can|would|do)|how long|what (are|is) the|next step|process|what (does|would) it)\b/i;

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function isGenuineRepQuestion(sentence) {
  const s = sentence.trim();
  if (!s.includes('?')) return false;
  if (s.split(/\s+/).length < 5) return false;
  if (CONFIRM_TAILS.test(s)) return false;
  return DE_OPEN.test(s) || DE_CLOSED.test(s) || EN_Q.test(s);
}

/**
 * A prospect question is a buying signal if it:
 * - Is meaningful (6+ words)
 * - Contains buying-signal keywords OR is an open "why/how/what" question
 * - Is NOT a generic clarification
 */
function isProspectBuyingSignal(sentence) {
  const s = sentence.trim();
  if (!s.includes('?')) return false;
  if (s.split(/\s+/).length < 4) return false;
  if (GENERIC_PROSPECT_Q.test(s)) return false;
  // Open "why/how/what" questions are almost always meaningful
  if (/^(why|how|what|when|where|who|which)\b/i.test(s)) return true;
  // Or contains buying signal keywords
  return BUYING_SIGNAL.test(s);
}

// ── Main computation ──────────────────────────────────────────────────────────
export function computeMetrics(segments, repSpeaker, totalDuration) {
  if (!segments || segments.length === 0) {
    return {
      talk: { rep: 50, prospect: 50 },
      monologue: 0, avgMonologue: 0,
      fillers: 0, fillerBreakdown: [],
      questions: 0, prospectQ: 0,
      prospectQuestions: [], unansweredQuestions: [],
      priceTiming: 0, interruptions: 0, avgProspectResponseLength: 0,
    };
  }

  const prospectSpeaker = repSpeaker === 0 ? 1 : 0;
  const repSegs      = segments.filter(s => s.speaker === repSpeaker);
  const prospectSegs = segments.filter(s => s.speaker === prospectSpeaker);

  // ── Talk ratio ──────────────────────────────────────────────────────────────
  const dur = s => Math.max((s.end || 0) - (s.start || 0), 0);
  const repDur      = repSegs.reduce((a, s) => a + dur(s), 0);
  const prospectDur = prospectSegs.reduce((a, s) => a + dur(s), 0);
  const totalDur    = repDur + prospectDur || 1;
  const talkRep      = Math.round((repDur / totalDur) * 100);
  const talkProspect = 100 - talkRep;

  // ── Monologue ───────────────────────────────────────────────────────────────
  let maxBlock = 0, curBlock = 0, blockCount = 0, blockSum = 0;
  for (const seg of segments) {
    if (seg.speaker === repSpeaker) {
      curBlock += dur(seg);
    } else if (curBlock > 0) {
      maxBlock = Math.max(maxBlock, curBlock);
      blockSum += curBlock; blockCount++;
      curBlock = 0;
    }
  }
  if (curBlock > 0) { maxBlock = Math.max(maxBlock, curBlock); blockSum += curBlock; blockCount++; }
  const monologue    = Math.round((maxBlock / 60) * 10) / 10;
  const avgMonologue = blockCount ? Math.round((blockSum / blockCount / 60) * 10) / 10 : 0;

  // ── Filler words — REP ONLY ─────────────────────────────────────────────────
  const repText = repSegs.map(s => s.text.toLowerCase()).join(' ');
  const fillerBreakdown = [];
  for (const { label, regex } of FILLER_PATTERNS) {
    regex.lastIndex = 0;
    const m = repText.match(regex);
    if (m?.length) fillerBreakdown.push({ word: label, count: m.length });
  }
  fillerBreakdown.sort((a, b) => b.count - a.count);
  const fillers = fillerBreakdown.reduce((s, f) => s + f.count, 0);

  // ── Rep questions — genuine only ────────────────────────────────────────────
  const repQuestions = [];
  for (const seg of repSegs) {
    for (const sentence of splitSentences(seg.text)) {
      if (isGenuineRepQuestion(sentence)) {
        repQuestions.push({ text: sentence, segIdx: segments.indexOf(seg) });
      }
    }
  }

  // ── Prospect questions — only buying signals ────────────────────────────────
  const prospectBuyingSignals = [];
  const prospectQSegMap = []; // for unanswered detection
  for (const seg of prospectSegs) {
    for (const sentence of splitSentences(seg.text)) {
      if (isProspectBuyingSignal(sentence)) {
        prospectBuyingSignals.push(sentence);
        prospectQSegMap.push({ text: sentence, segIdx: segments.indexOf(seg) });
      }
    }
  }

  // ── Unanswered questions — PROSPECT questions the REP didn't address ────────
  // A prospect question is "unanswered" when the NEXT rep segment is:
  // - Very short (< 8 words) — just an acknowledgment
  // - Or doesn't address the topic (we check for keywords overlap)
  const SHORT_ACK = /^(ok|okay|yes|yeah|sure|right|absolutely|great|alright|mm|mhm|got it|i see|understood|exactly|of course)\b/i;
  const unansweredQuestions = [];

  for (const { text, segIdx } of prospectQSegMap) {
    let nextRepSeg = null;
    for (let i = segIdx + 1; i < Math.min(segIdx + 5, segments.length); i++) {
      if (segments[i].speaker === repSpeaker) { nextRepSeg = segments[i]; break; }
    }
    if (!nextRepSeg) {
      unansweredQuestions.push(text);
    } else {
      const words = nextRepSeg.text.split(/\s+/).length;
      const isShortAck = SHORT_ACK.test(nextRepSeg.text.trim()) && words < 8;
      // Rep switched topic without engaging the question
      const repChangedTopic = words < 6;
      if (isShortAck || repChangedTopic) unansweredQuestions.push(text);
    }
  }

  // ── Interruptions ───────────────────────────────────────────────────────────
  let interruptions = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    if (prev.speaker === prospectSpeaker && curr.speaker === repSpeaker) {
      const gap = (curr.start || 0) - (prev.end || 0);
      if (gap < 0.5 && gap > -2) interruptions++;
    }
  }

  // ── Avg prospect response length ────────────────────────────────────────────
  const avgProspectResponseLength = prospectSegs.length
    ? Math.round(prospectSegs.map(s => s.text.split(/\s+/).length).reduce((a, b) => a + b, 0) / prospectSegs.length)
    : 0;

  // ── Price timing ────────────────────────────────────────────────────────────
  const PRICE_KW = /\b(euro|€|\$|£|preis|kosten|beitrag|zahlen|monatlich|rate|budget|kostet|price|cost|fee|payment|monthly|invest|dollar|per month|annually)\b/i;
  let priceTiming = 0;
  for (const seg of segments) {
    if (PRICE_KW.test(seg.text)) {
      priceTiming = Math.round(((seg.start || 0) / (totalDuration || 1)) * 100);
      break;
    }
  }

  return {
    talk: { rep: talkRep, prospect: talkProspect },
    monologue, avgMonologue,
    fillers, fillerBreakdown,
    questions: repQuestions.length,
    prospectQ: prospectBuyingSignals.length,
    prospectQuestions: prospectBuyingSignals.slice(0, 8),
    unansweredQuestions: unansweredQuestions.slice(0, 8),
    priceTiming, interruptions, avgProspectResponseLength,
  };
}

export function buildLabeledTranscript(segments, repSpeaker, clientLabel = 'KUNDE') {
  return segments
    .map(s => {
      const label = s.speaker === repSpeaker ? '[REP]' : `[${clientLabel}]`;
      return `${label} (${s.start.toFixed(0)}s): ${s.text}`;
    })
    .join('\n');
}
