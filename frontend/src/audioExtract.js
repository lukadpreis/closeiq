import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

// Files smaller than this are uploaded as-is (no extraction needed —
// they're already well within Supabase's 50MB free-tier limit).
export const EXTRACTION_THRESHOLD_BYTES = 40 * 1024 * 1024; // 40MB

// ffmpeg.wasm (single-threaded core) can only address ~2GB of WASM memory.
// Files larger than this can't be processed in-browser.
export const MAX_PROCESSABLE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

let ffmpegPromise = null;

function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

// Extracts and compresses the audio track of `file` into a small MP3
// (64kbps, mono, 16kHz — matches the backend's Deepgram-optimized settings).
// Calls onProgress(0-100) during transcoding.
// Returns a File so the rest of the upload pipeline can treat it the same
// as a user-picked file (keeps a sensible filename for Supabase Storage).
export async function extractAudioTrack(file, onProgress) {
  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }) => {
    if (onProgress && Number.isFinite(progress)) {
      onProgress(Math.min(100, Math.max(0, Math.round(progress * 100))));
    }
  };
  ffmpeg.on('progress', progressHandler);

  const ext = (file.name.match(/\.[^.]+$/)?.[0] || '.mp4').toLowerCase();
  const inputName = `input${ext}`;
  const outputName = 'output.mp3';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-acodec', 'libmp3lame',
      '-b:a', '64k',
      '-ac', '1',
      '-ar', '16000',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'audio/mpeg' });
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.mp3`, { type: 'audio/mpeg' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    try { await ffmpeg.deleteFile(inputName); } catch (_) {}
    try { await ffmpeg.deleteFile(outputName); } catch (_) {}
  }
}
