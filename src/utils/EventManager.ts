import Logger from "./Logger.ts";

// Define types for the event system
type EventCallback = (...args: any[]) => void;
type EventId = number;
type EventListeners = Map<EventId, EventCallback>;

const eventRegistry = new Map<string, EventListeners>();

let nextId = 1;

const eventLogger = new Logger("Event Manager");

const listen = (eventName: string, callback: EventCallback): EventId => {
  if (!eventRegistry.has(eventName)) {
    eventRegistry.set(eventName, new Map());
  }

  const id = nextId++;
  const listeners = eventRegistry.get(eventName);
  if (listeners) {
    listeners.set(id, callback);
  }
  return id;
};

const unListen = (id: EventId): boolean => {
  for (const [eventName, listeners] of eventRegistry) {
    if (listeners.has(id)) {
      listeners.delete(id);
      if (listeners.size === 0) {
        eventRegistry.delete(eventName);
      }
      return true; // Listener removed
    }
  }
  return false; // Listener not found
};

const evoke = (eventName: string, ...args: any[]): void => {
  const listeners = eventRegistry.get(eventName);
  if (listeners) {
    for (const callback of listeners.values()) {
      try {
        callback(...args);
      } catch (error) {
        eventLogger.error(`A listener for "${eventName}" threw`, error);
      }
    }
  }
};

const Event = {
  listen,
  unListen,
  evoke,
};

export default Event;
