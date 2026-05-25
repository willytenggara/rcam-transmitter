import { RtAudio, RtAudioFormat, RtAudioApi, OpusEncoder } from "audify";
import { WebSocketServer, WebSocket } from "ws";

// -- Audio Constants
const INPUT_DEVICE_ID = 5;
const SAMPLE_RATE = 48000;
const BUFFER_FRAMES = 512;
const INPUT_CHANNELS = 32;
const BYTES_PER_SAMPLE = 2;
const FRAME_SIZE = INPUT_CHANNELS * BYTES_PER_SAMPLE;

// Opus requires exactly 960 frames per encode call at 48 KHz =  20 ms
const OPUS_FRAME_SIZE = 960;
const STEREO_FRAME_BYTES = 2 * BYTES_PER_SAMPLE; // 4 bytes per stereo
const OPUS_BUFFER_SIZE = OPUS_FRAME_SIZE * STEREO_FRAME_BYTES; // 3840 bytes

// -- WebSocket server
const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server listening on port ${PORT}`);
console.log("Waiting for reveiver to connect...\n");

// -- Opus encoder
// 2051  = OPUS_APPLICATION_RESTRICTED_LOWDELAY - lowest latency mode
const encoder = new OpusEncoder(SAMPLE_RATE, 2, 2051);

// -- Accumulator
// Holds leftover stereo PCM between callbacks until we have 960 frames
let accumulator = Buffer.alloc(0);

// -- Audio capture
const rtAudio = new RtAudio(RtAudioApi.WINDOWS_WASAPI);

rtAudio.openStream(
  null,
  {
    deviceId: INPUT_DEVICE_ID,
    nChannels: INPUT_CHANNELS,
    firstChannel: 0,
  },
  RtAudioFormat.RTAUDIO_SINT16,
  SAMPLE_RATE,
  BUFFER_FRAMES,
  "RCAM-transmitter",
  (inputData: Buffer) => {
    // Step 1: de-interleave - extract ch 0/1 from 32ch buffer into stereo buffer
    const stereo = Buffer.alloc(BUFFER_FRAMES * STEREO_FRAME_BYTES);

    for (let frame = 0; frame < BUFFER_FRAMES; frame++) {
      const inOffset = frame * FRAME_SIZE;
      const outOffset = frame * STEREO_FRAME_BYTES;

      const l = inputData.readInt16LE(inOffset + 0 * BYTES_PER_SAMPLE);
      const r = inputData.readInt16LE(outOffset + 1 * BYTES_PER_SAMPLE);

      stereo.writeInt16LE(l, outOffset);
      stereo.writeInt16LE(r, outOffset + BYTES_PER_SAMPLE);
    }

    // Step 2: append new stereo frames to the accumulator
    accumulator = Buffer.concat([accumulator, stereo]);

    // Step 3: encode and send as many 960-frame Opus packets as possible
    while (accumulator.length >= OPUS_BUFFER_SIZE) {
      const chunk = accumulator.subarray(0, OPUS_BUFFER_SIZE);
      accumulator = accumulator.subarray(OPUS_BUFFER_SIZE); // keep the remainder

      const encoded = encoder.encode(chunk, OPUS_FRAME_SIZE);

      // Broadcast to all connected receivers
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(encoded);
        }
      });
    }
  },
  null,
);

rtAudio.start();
console.log("Capturing audio - waiting for receiver...");

wss.on("connection", () => {
  console.log("Receiver connected - streaming audio");
});

process.on("SIGINT", () => {
  rtAudio.stop();
  rtAudio.closeStream();
  wss.close();
  process.exit(0);
});
