import { io } from "npm:socket.io-client";

export const socket = io("https://ws.spicylyrics.org", {
  transports: ["polling", "websocket"],
  autoConnect: false,
  timeout: 30000,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 5000,
  reconnectionDelayMax: 100000,
  retries: Infinity,
  ackTimeout: 20000,
  path: "/",
});

socket.on("connect", () => {
  console.log("(Spicy Lyrics) [Socket.IO] Socket Connected");
  console.log("(Spicy Lyrics) [Socket.IO] Using Transport:", socket.io.engine.transport.name);

  socket.io.engine.on("upgrade", (transport) => {
    console.log("(Spicy Lyrics) [Socket.IO] Upgraded transport to:", transport.name);
  });
});

socket.on("disconnect", () => {
  console.warn("(Spicy Lyrics) [Socket.IO] Socket Disconnected");
});

socket.on("connect_error", (e) => {
  console.error("(Spicy Lyrics) [Socket.IO] Socket Error", e);
});
