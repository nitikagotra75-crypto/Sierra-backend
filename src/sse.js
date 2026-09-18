const { EventEmitter } = require("events");

// One emitter per projectId so multiple clients/tabs can subscribe independently.
const emitters = new Map();

function getEmitter(projectId) {
  if (!emitters.has(projectId)) {
    const em = new EventEmitter();
    em.setMaxListeners(50);
    emitters.set(projectId, em);
  }
  return emitters.get(projectId);
}

/**
 * Emit a real progress event for a project. This is called ONLY from actual
 * pipeline steps (see orchestrator.js) — never emitted speculatively before
 * the underlying action has actually happened.
 */
function emitEvent(projectId, event) {
  const payload = { ts: new Date().toISOString(), ...event };
  getEmitter(projectId).emit("event", payload);
  return payload;
}

function subscribe(projectId, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`event: ping\ndata: {}\n\n`);

  const em = getEmitter(projectId);
  const listener = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  em.on("event", listener);

  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15000);

  res.on("close", () => {
    em.removeListener("event", listener);
    clearInterval(keepAlive);
  });
}

module.exports = { emitEvent, subscribe };