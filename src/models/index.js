const mongoose = require("mongoose");
const { Schema } = mongoose;

const ProjectSchema = new Schema(
  {
    projectId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    requirement: { type: String, required: true },
    techStack: {
      backend: { type: String, default: "Node.js + Express" },
      database: { type: String, default: "MongoDB" },
      testing: { type: String, default: "Jest + Supertest" },
    },
    architecture: { type: Schema.Types.Mixed, default: null },
    analysis: { type: Schema.Types.Mixed, default: null },
    generatedFiles: { type: [String], default: [] },
    workspacePath: { type: String, default: null },
    port: { type: Number, default: null },
    envVars: { type: [String], default: [] },
    apisCreated: { type: [String], default: [] },
    modelsCreated: { type: [String], default: [] },
    fixAttempts: { type: Schema.Types.Mixed, default: [] },
    filesChangedDuringDebug: { type: [String], default: [] },
    finalStatus: { type: String, enum: ["PENDING", "RUNNING", "VERIFIED", "FAILED", "NOT_VERIFIED"], default: "PENDING" },
    report: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const ProjectFileSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    path: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);
ProjectFileSchema.index({ projectId: 1, path: 1 }, { unique: true });

const TestRunSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    phase: { type: String, required: true }, // initial | retest | regression
    attempt: { type: Number, default: 0 },
    results: { type: Schema.Types.Mixed, default: [] },
    passed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    rawOutput: { type: String, default: "" },
  },
  { timestamps: true }
);

const AgentRunSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    agent: { type: String, required: true },
    input: { type: Schema.Types.Mixed, default: null },
    output: { type: Schema.Types.Mixed, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const mongooseModels = {
  Project: mongoose.model("Project", ProjectSchema),
  ProjectFile: mongoose.model("ProjectFile", ProjectFileSchema),
  TestRun: mongoose.model("TestRun", TestRunSchema),
  AgentRun: mongoose.model("AgentRun", AgentRunSchema),
};

const localStore = require("../localStorage");

// Dynamically delegate to real Mongoose models (production / whenever a real
// MongoDB is reachable) or to the sandbox-only in-memory store, decided at
// call time via a global flag set once in index.js after the real connection
// attempt has actually resolved or failed. See localStore.js for why this
// fallback exists — it is only ever used when a real Mongo connection could
// not be established.
function proxyFor(name) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const backend = global.__BACKENDFORGE_LOCAL_MODE__ ? localStore[name] : mongooseModels[name];
        return backend[prop] ? backend[prop].bind(backend) : backend[prop];
      },
    }
  );
}

module.exports = {
  Project: proxyFor("Project"),
  ProjectFile: proxyFor("ProjectFile"),
  TestRun: proxyFor("TestRun"),
  AgentRun: proxyFor("AgentRun"),
};