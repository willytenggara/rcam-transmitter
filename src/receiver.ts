import { RtAudio, RtAudioFormat, RtAudioApi, OpusDecoder } from "audify";
import { WebSocket } from "ws";

// === Windows PC's local IP Address ===
const TRANSMITTER_IP = "192.168.10.1";
const PORT = 8080;

// === Audio constants ===
const OUTPUT_DEVICE_ID = 131; // Macbook Air Speakers
const SAMPLE_RATE = 48000;
const OPUS_FRAME_SIZE = 960;

// === Opus decoder ===
const decoder = new OpusDecoder(SAMPLE_RATE, 2);

// === Audio output ===
const rtAudio = new RtAudio(RtAudioApi.MACOSX_CORE);

rtAudio.openStream(
  {
    deviceId: OUTPUT_DEVICE_ID,
    nChannels: 2,
  },
  null,
  RtAudioFormat.RTAUDIO_SINT16,
  SAMPLE_RATE,
  OPUS_FRAME_SIZE, // output buffer matches exactly one Opus frame
  "RCAM-receiver",
  null,
  null,
);

rtAudio.start();

// === WebSocket client ===
const ws = new WebSocket(`ws://${TRANSMITTER_IP}:${PORT}`);

ws.on("message", (data: Buffer) => {
  // Decode Opus packet back to stereo PCM
  const pcm = decoder.decode(data, OPUS_FRAME_SIZE);

  // Push decode PCM into audify's output queue
  rtAudio.write(pcm);
});

ws.on("open", () => {
  console.log(`Connected to transmitter at ${TRANSMITTER_IP}:${PORT}`);
  console.log("Receiving audio...");
});

ws.on("close", () => {
  console.log("Disconnected from transmitter");
  rtAudio.stop();
  rtAudio.closeStream();
  process.exit(0);
});

ws.on("error", (err) => {
  console.log("WebSocket error: ", err.message);
});

process.on("SIGINT", () => {
  rtAudio.stop();
  rtAudio.closeStream();
  ws.close();
  process.exit(0);
});
