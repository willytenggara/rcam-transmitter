console.log("1. starting");

import wrtc from "@roamhq/wrtc";
console.log("2. wrtc loaded");

import Peer from "simple-peer";
console.log("3. simple-peer loaded");

const peer = new Peer({ initiator: true, trickle: false, wrtc });
console.log("4. peer created");

peer.on("signal", (signal) => {
  console.log("5. signal generated:", JSON.stringify(signal).slice(0, 50));
});

peer.on("error", (err) => {
  console.error("peer error:", err.message);
});
