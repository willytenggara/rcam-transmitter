import { RtAudio, RtAudioFormat, RtAudioApi, OpusEncoder } from "audify";
import wrtc from "@roamhq/wrtc";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// === Audio Constants ===
const INPUT_DEVICE_ID = 5;
const SAMPLE_RATE = 48000;
const BUFFER_FRAMES = 512;
const INPUT_CHANNELS = 32;
const BYTES_PER_SAMPLE = 2;
const FRAME_SIZE = INPUT_CHANNELS * BYTES_PER_SAMPLE;

const OPUS_FRAME_SIZE = 960;
const STEREO_FRAME_BYTES = 2 * BYTES_PER_SAMPLE;
const OPUS_BUFFER_SIZE = OPUS_FRAME_SIZE * STEREO_FRAME_BYTES;

// === Opus Encoder ===
const encoder = new OpusEncoder(SAMPLE_RATE, 2, 2051);

// === Accumulator ===
let accumulator = Buffer.alloc(0);

console.log("1. imports done");
// === Audio Capture ===
const rtAudio = new RtAudio(RtAudioApi.WINDOWS_WASAPI);
console.log("2. rtAudio created");

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
  "RCAM-church",
  (inputData: Buffer) => {
    // De-interleaved -- ectract ch 0/1 from 32ch buffer
    const stereo = Buffer.alloc(BUFFER_FRAMES * STEREO_FRAME_BYTES);

    for (let frame = 0; frame < BUFFER_FRAMES; frame++) {
      const inOffset = frame * FRAME_SIZE;
      const outOffset = frame * STEREO_FRAME_BYTES;

      const l = inputData.readInt16LE(inOffset + 0 * BYTES_PER_SAMPLE);
      const r = inputData.readInt16LE(inOffset + 1 * BYTES_PER_SAMPLE);

      stereo.writeInt16LE(l, outOffset);
      stereo.writeInt16LE(r, outOffset + BYTES_PER_SAMPLE);
    }

    // Accumulate and encode
    accumulator = Buffer.concat([accumulator, stereo]);

    while (accumulator.length >= OPUS_BUFFER_SIZE) {
      const chunk = accumulator.subarray(0, OPUS_BUFFER_SIZE);
      accumulator = accumulator.subarray(OPUS_BUFFER_SIZE);

      const encoded = encoder.encode(chunk, OPUS_FRAME_SIZE);

      // Send over WebRTC if peer is connected
      if (peer && peer.connected) {
        peer.send(encoded);
      }
    }
  },
  null,
);
console.log("3. stream opened");

rtAudio.start();
console.log("4. stream started");

// === Signaling ===
const SIGNALING_URL = "http://192.168.10.1:3000";

const socket = io(SIGNALING_URL);
console.log("5. socket created");
let peer: Peer.Instance | null = null;

// === Signaling Events ===
socket.on("connect", () => {
  console.log("Connected to signaling server");
  socket.emit("register", "church");
});

// Signaling server tells church to initiate the offer
socket.on("start", () => {
  console.log("Both peers ready -- creating WebRTC offer");

  peer = new Peer({ initiator: true, trickle: true, wrtc });

  peer.on("signal", (signal) => {
    // Sendt SDP offer or ICE candidate to monitor via signaling server
    socket.emit("signal", { target: "monitor", signal });
  });

  peer.on("connect", () => {
    console.log("WebRTC peer connection established");
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err.message);
  });
});

// Relay incoming signals from monitor back into simple-peer
socket.on("signal", ({ signal }) => {
  if (peer) {
    peer.signal(signal);
  }
});

process.on("SIGINT", () => {
  rtAudio.stop();
  rtAudio.closeStream();
  socket.disconnect();
  process.exit(0);
});
