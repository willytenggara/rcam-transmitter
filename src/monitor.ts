import { RtAudio, RtAudioFormat, RtAudioApi, OpusDecoder } from "audify";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import wrtc from "@roamhq/wrtc";

// ── Audio constants ──────────────────────────────────────────────
const OUTPUT_DEVICE_ID = 131; // MacBook Air Speakers
const SAMPLE_RATE = 48000;
const OPUS_FRAME_SIZE = 960;

// ── Opus decoder ─────────────────────────────────────────────────
const decoder = new OpusDecoder(SAMPLE_RATE, 2);

// ── Audio output ─────────────────────────────────────────────────
const rtAudio = new RtAudio(RtAudioApi.MACOSX_CORE);

rtAudio.openStream(
  { deviceId: OUTPUT_DEVICE_ID, nChannels: 2 },
  null,
  RtAudioFormat.RTAUDIO_SINT16,
  SAMPLE_RATE,
  OPUS_FRAME_SIZE,
  "RCAM-monitor",
  null,
  null,
);

rtAudio.start();

// ── Signaling ────────────────────────────────────────────────────
const SIGNALING_URL = "http://192.168.10.1:3000";

const socket = io(SIGNALING_URL);
let peer: Peer.Instance | null = null;

socket.on("connect", () => {
  console.log("Connected to signaling server");
  socket.emit("register", "monitor");
});

// Church initiates — monitor receives the offer and answers
socket.on("signal", ({ signal }) => {
  if (!peer) {
    // First signal from church — create peer as non-initiator
    peer = new Peer({ initiator: false, trickle: true, wrtc });

    peer.on("signal", (responseSignal) => {
      // Send answer or ICE candidate back to church
      socket.emit("signal", { target: "church", signal: responseSignal });
    });

    peer.on("connect", () => {
      console.log("WebRTC peer connection established");
      console.log("Receiving audio...");
    });

    peer.on("data", (data: Buffer) => {
      // Decode Opus packet and push to output queue
      const pcm = decoder.decode(data, OPUS_FRAME_SIZE);
      rtAudio.write(pcm);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err.message);
    });
  }

  peer.signal(signal);
});

process.on("SIGINT", () => {
  rtAudio.stop();
  rtAudio.closeStream();
  socket.disconnect();
  process.exit(0);
});
