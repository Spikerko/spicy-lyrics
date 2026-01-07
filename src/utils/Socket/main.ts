import { io, type Socket } from "socket.io-client";
import Session from "../../components/Global/Session.ts";
import ConnectionIndicator from "../../components/ConnectionIndicator/main.ts";
import storage from "../storage.ts";

export const SOCKET_HOST = "https://skt-v2.spicylyrics.org";

const SOCKET_CONFIG = {
  transports: ["polling", "websocket"],
  autoConnect: true,
  timeout: 60000,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 3000,
  reconnectionDelayMax: 100000,
  randomizationFactor: 1.5,
  ackTimeout: 20000,
  path: "/realtime",
} as const;

const LOG_PREFIX = "[Spicy Lyrics] [Socket.IO]";

const log = {
  info: (...args: unknown[]) => {
    if (storage.get("developerMode") === "true") {
      console.log(LOG_PREFIX, ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (storage.get("developerMode") === "true") {
      console.warn(LOG_PREFIX, ...args);
    }
  },
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
};

// deno-lint-ignore no-explicit-any
export const socket: Socket = io(SOCKET_HOST, SOCKET_CONFIG as any);

const reportClientVersion = (): void => {
  const clientVersion = Session.SpicyLyrics.GetCurrentVersion();
  socket.emit("report", { client: { version: clientVersion.Text } });
};

const setupTransportUpgradeLogging = (): void => {
  socket.io.engine.once("upgrade", (transport) => {
    log.info("Upgraded transport to:", transport.name);
  });
};

socket.on("connect", () => {
  log.info("Connected");
  log.info("Using transport:", socket.io.engine.transport.name);

  reportClientVersion();
  setupTransportUpgradeLogging();
  ConnectionIndicator.SetState("connected");
});

socket.on("disconnect", (reason) => {
  log.warn("Disconnected:", reason);
  ConnectionIndicator.SetState("disconnected");
});

socket.on("connect_error", (error) => {
  log.error("Connection error:", error.message);
  ConnectionIndicator.SetState("connect_error");
});

socket.io.on("reconnect", (attempt) => {
  log.info("Reconnected after", attempt, "attempts");
  ConnectionIndicator.SetState("connected");
});

socket.io.on("reconnect_attempt", (attempt) => {
  log.info("Reconnection attempt:", attempt);
  ConnectionIndicator.SetState("reconnecting");
});

socket.io.on("reconnect_failed", () => {
  log.error("Reconnection failed permanently");
  ConnectionIndicator.SetState("reconnect_final_fail");
});

export const disconnectSocket = (): void => {
  socket.disconnect();
};

export const connectSocket = (): void => {
  if (!socket.connected) {
    socket.connect();
  }
};