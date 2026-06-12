import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegPath);

// Extract audio from video/audio file → compressed MP3 (~30MB for a 1h call)
export function extractAudio(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(os.tmpdir(), `ciq-audio-${Date.now()}.mp3`);
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')         // 64kbps is plenty for speech
      .audioChannels(1)            // mono — saves 50% more space
      .audioFrequency(16000)       // 16kHz — Deepgram optimal for speech
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function transcribeAudio(audioPath) {
  const params = new URLSearchParams({
    model: 'nova-2',
    detect_language: 'true',
    smart_format: 'true',
    filler_words: 'true',      // keep uh/um/äh in transcript instead of removing them
    diarize: 'true',
    punctuate: 'true',
    utterances: 'true',
    utt_split: '0.8',
  });

  const fileBuffer = fs.readFileSync(audioPath);
  const fileSize = fileBuffer.length;
  console.log(`[deepgram] sending ${(fileSize / 1024 / 1024).toFixed(1)}MB to Deepgram…`);

  const data = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.deepgram.com',
      path: `/v1/listen?${params}`,
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY?.trim()}`,
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileSize,
      },
      timeout: 300_000, // 5 min
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Deepgram ${res.statusCode}: ${raw}`));
        } else {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error(`JSON parse error: ${raw.slice(0, 300)}`)); }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Deepgram timed out')); });

    const stream = fs.createReadStream(audioPath);
    stream.pipe(req);
  });

  const channel = data.results.channels[0].alternatives[0];
  const utterances = data.results.utterances || [];
  const duration = data.metadata.duration;
  const detectedLanguage = data.results.channels[0]?.detected_language || 'de';
  console.log('[deepgram] detected language:', detectedLanguage);

  const segments = utterances.map(u => ({
    speaker: u.speaker,
    start: u.start,
    end: u.end,
    text: u.transcript,
  }));

  const transcript = segments
    .map(s => `[Speaker ${s.speaker}] (${s.start.toFixed(1)}s): ${s.text}`)
    .join('\n');

  return { transcript, segments, duration, words: channel.words || [], language: detectedLanguage };
}
