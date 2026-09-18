const { v4: uuid } = require("uuid");

async function main() {
  const { connectDB } = require("./src/db");
  const dbInfo = await connectDB();
  global.__BACKENDFORGE_MEMDB_URI__ = dbInfo && dbInfo.ephemeral ? dbInfo.uri : null;

  const { Project } = require("./src/models");
  const { runPipeline } = require("./src/orchestrator");
  const { emitEvent, subscribe } = require("./src/sse");

  const projectId = uuid();
  await Project.create({
    projectId,
    name: "Task Manager API",
    requirement:
      "Create a Task Management REST API with user registration, login, and CRUD operations for tasks.",
  });

  // Print every SSE event live to stdout so we see real progress, not just the end result.
  const { EventEmitter } = require("events");
  const sseModule = require("./src/sse");
  // Tap into emitEvent by wrapping it (subscribe() writes to an http res object,
  // which we don't have here, so instead we monkey-patch emitEvent to also log).
  const originalEmit = sseModule.emitEvent;
  sseModule.emitEvent = function (pid, event) {
    const payload = originalEmit(pid, event);
    console.log(`[EVENT] ${payload.icon || ""} ${payload.text || JSON.stringify(payload)}`);
    return payload;
  };
  // orchestrator.js already required emitEvent by reference at load time, so we
  // need to require orchestrator AFTER patching. Delete cache and re-require.
  delete require.cache[require.resolve("./src/orchestrator")];
  const { runPipeline: runPipelinePatched } = require("./src/orchestrator");

  console.log(`\n=== Running BackendForge pipeline for project ${projectId} ===\n`);
  const report = await runPipelinePatched(projectId);

  console.log("\n=== FINAL REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  process.exit(report && report.status === "VERIFIED" ? 0 : 1);
}

main().catch((err) => {
  console.error("DEMO FAILED", err);
  process.exit(1);
});