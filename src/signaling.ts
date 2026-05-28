import { sign } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3000;

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

// Track connected peers by role
let peers: Record<string, string> = {};

io.on("connection", (socket) => {
  console.log(`Peer connected: ${socket.id}`);

  // Peer registers its role: 'church' or 'monitor'
  socket.on("register", (role: string) => {
    peers[role] = socket.id;
    console.log(`Registered as: ${role} (${socket.id})`);

    // If both peers are connected, tell church to initiate the offer
    if (peers["church"] && peers["monitor"]) {
      console.log("Botth peers connected - starting handshake");
      io.to(peers["church"]).emit("start");
    }
  });

  // Relay SDP offer/answer and ICE candidates between peers
  socket.on("signal", (data: { target: string; signal: unknown }) => {
    const targetId = peers[data.target];
    if (targetId) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal,
      });
    }
  });

  socket.on("disconnect", () => {
    // Remove peer from registry
    Object.keys(peers).forEach((role) => {
      if (peers[role] === socket.id) {
        console.log(`${role} disconnected`);
        delete peers[role];
      }
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
