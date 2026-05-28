import { RtAudio, RtAudioApi } from "audify";

const rtAudio = new RtAudio(RtAudioApi.WINDOWS_WASAPI);

const devices = rtAudio.getDevices();

devices.forEach((device, index) => {
  console.log(`[${index}] id=${device.id} ${device.name}`);
  console.log(`     inputs:  ${device.inputChannels}`);
  console.log(`     outputs: ${device.outputChannels}`);
  console.log("---");
});
