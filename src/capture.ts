import { RtAudio, RtAudioFormat, RtAudioApi, RtAudioStreamFlags } from "audify";

const rtAudio = new RtAudio(RtAudioApi.WINDOWS_WASAPI);

// Device indices confirmed from listDevices.ts
const INPUT_DEVICE_ID = 5; // Line (BEHRINGER X-USB) -- 32 inputs
const SAMPLE_RATE = 48000; // X32 native sample rate
const BUFFER_FRAMES = 512; // ~10ms at 48kHz — low latency
const INPUT_CHANNELS = 32; // Full channel count from Device [5]
const BYTES_PER_SAMPLE = 2; // SINT16 = 2 bytes
const FRAME_SIZE = INPUT_CHANNELS * BYTES_PER_SAMPLE;

let frameCount = 0;

rtAudio.openStream(
  null, // no output stream yet
  // Input stream (capture from X32)
  {
    deviceId: INPUT_DEVICE_ID,
    nChannels: INPUT_CHANNELS,
    firstChannel: 0,
  },
  RtAudioFormat.RTAUDIO_SINT16,
  SAMPLE_RATE,
  BUFFER_FRAMES,
  "RCAM-capture",
  (inputData: Buffer) => {
    frameCount++;

    // Only log every 100 callbacks (~1 second) to keep console readable
    if (frameCount % 100 !== 0) return;

    let peakL = 0;
    let peakR = 0;

    for (let frame = 0; frame < BUFFER_FRAMES; frame++) {
      const offset = frame * FRAME_SIZE;

      // Channel index 0 = Monitor L
      const l = Math.abs(inputData.readInt16LE(offset + 0 * BYTES_PER_SAMPLE));
      // CHannel index 1 = Monitor R
      const r = Math.abs(inputData.readInt16LE(offset + 1 * BYTES_PER_SAMPLE));

      if (l > peakL) peakL = l;
      if (r > peakR) peakR = r;
    }

    // SINT16 max value is 32767 - normalise to 0.0-1.0
    const normalL = (peakL / 32767).toFixed(4);
    const normalR = (peakR / 32767).toFixed(4);

    console.log(`L: ${normalL}  R: ${normalR}`);
  },
  null,
);

rtAudio.start();

console.log("Capturing Monitor LR from X32 - watching channels 0 and 1");
console.log(
  "You should see non-zero value if signal is present on the console",
);
console.log("Press Ctrl+C to stop\n");

process.on("SIGINT", () => {
  rtAudio.stop();
  rtAudio.closeStream();
  process.exit(0);
});
