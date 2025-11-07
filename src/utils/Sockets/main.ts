import { socket as ws } from "./ws/main.ts";

// Define a type for socket objects that have a connect method
interface SocketWithConnect {
  connect: () => Promise<void> | any;
}

// Define the structure of the sockets object
interface SocketsMap {
  [key: string]: SocketWithConnect;
}

// Create a typed sockets object
const socketMap: SocketsMap = {
  ws,
};

const Sockets = {
  sockets: socketMap,
  all: {
    ConnectSockets,
  },
};

async function ConnectSockets() {
  for (const key of Object.keys(Sockets?.sockets)) {
    await Sockets.sockets[key]?.connect();
  }
}

export default Sockets;
