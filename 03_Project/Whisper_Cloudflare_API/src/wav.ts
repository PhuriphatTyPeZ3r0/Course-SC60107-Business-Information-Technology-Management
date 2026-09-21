// Minimal PCM WAV parsing/channel-splitting in pure TypeScript.
//
// Why this exists: the local FastAPI backend shells out to ffmpeg
// (Process/audio_channels.py) to probe channel count and split stereo into
// two mono files. Workers have no subprocess execution and no ffmpeg -
// only WASM/JS. A full audio-container/codec library (e.g. ffmpeg.wasm) is
// a multi-MB dependency of uncertain fit within Workers' size/CPU limits,
// so for this MVP we instead only support uncompressed PCM WAV input and
// parse/split it by hand. This is a real, deliberate scope cut versus the
// local backend (which accepts .wav/.mp3/.m4a/.flac/.ogg/.webm) - see
// FRONTEND_HANDOFF.md-equivalent notes in this project's README.
//
// Handles the common case: a standard RIFF/WAVE file with "fmt " before
// "data", integer PCM (8/16/24/32-bit). Does not handle WAVE_FORMAT_EXTENSIBLE
// quirks, non-PCM codecs, or unusual chunk ordering beyond skipping unknown
// chunks.

export interface WavInfo {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

export function parseWavHeader(buffer: ArrayBuffer): WavInfo {
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }

  let offset = 12;
  let fmt: { numChannels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let data: { offset: number; length: number } | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt ") {
      fmt = {
        numChannels: view.getUint16(chunkDataStart + 2, true),
        sampleRate: view.getUint32(chunkDataStart + 4, true),
        bitsPerSample: view.getUint16(chunkDataStart + 14, true),
      };
    } else if (chunkId === "data") {
      data = { offset: chunkDataStart, length: chunkSize };
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!fmt || !data) throw new Error("WAV file missing fmt or data chunk");
  return {
    numChannels: fmt.numChannels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    dataOffset: data.offset,
    dataLength: data.length,
  };
}

function buildWavHeader(numChannels: number, sampleRate: number, bitsPerSample: number, dataLength: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format tag
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);
  return buffer;
}

/** Splits an interleaved-stereo PCM WAV into two mono PCM WAV buffers (left, right). */
export function splitStereoWav(buffer: ArrayBuffer): { left: ArrayBuffer; right: ArrayBuffer } {
  const info = parseWavHeader(buffer);
  if (info.numChannels !== 2) throw new Error(`Expected 2-channel WAV, got ${info.numChannels}`);
  if (![16, 24, 32].includes(info.bitsPerSample)) {
    throw new Error(`Unsupported bits-per-sample for channel split: ${info.bitsPerSample}`);
  }

  const bytesPerSample = info.bitsPerSample / 8;
  const frameCount = Math.floor(info.dataLength / (bytesPerSample * 2));
  const src = new Uint8Array(buffer, info.dataOffset, frameCount * bytesPerSample * 2);

  const leftData = new Uint8Array(frameCount * bytesPerSample);
  const rightData = new Uint8Array(frameCount * bytesPerSample);
  for (let i = 0; i < frameCount; i++) {
    const srcOffset = i * bytesPerSample * 2;
    const dstOffset = i * bytesPerSample;
    leftData.set(src.subarray(srcOffset, srcOffset + bytesPerSample), dstOffset);
    rightData.set(src.subarray(srcOffset + bytesPerSample, srcOffset + bytesPerSample * 2), dstOffset);
  }

  const makeWav = (pcm: Uint8Array) => {
    const header = buildWavHeader(1, info.sampleRate, info.bitsPerSample, pcm.byteLength);
    const out = new Uint8Array(header.byteLength + pcm.byteLength);
    out.set(new Uint8Array(header), 0);
    out.set(pcm, header.byteLength);
    return out.buffer;
  };

  return { left: makeWav(leftData), right: makeWav(rightData) };
}
