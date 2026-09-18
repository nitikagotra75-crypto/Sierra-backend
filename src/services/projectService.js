const { v4: uuid } = require("uuid");
const { Project, ProjectFile, TestRun } = require("../models");
const { runPipeline } = require("../orchestrator");

async function createProject({ name, requirement }) {
  if (!name || !requirement) {
    const err = new Error("name and requirement are required");
    err.statusCode = 400;
    throw err;
  }
  const projectId = uuid();
  return Project.create({ projectId, name, requirement });
}

async function listProjects() {
  return Project.find().sort({ createdAt: -1 }).limit(50);
}

async function getProject(projectId) {
  const project = await Project.findOne({ projectId });
  if (!project) {
    const err = new Error("not found");
    err.statusCode = 404;
    throw err;
  }
  return project;
}

async function startGeneration(projectId) {
  // Confirms the project exists, then fires the pipeline in the background.
  // Progress is delivered over SSE at /:id/events, not in this response.
  await getProject(projectId);
  runPipeline(projectId).catch((e) => console.error("[pipeline] fatal", e));
}

async function listFiles(projectId) {
  const files = await ProjectFile.find({ projectId }, "path -_id").sort({ path: 1 });
  return files.map((f) => f.path);
}

async function getFile(projectId, filePath) {
  const file = await ProjectFile.findOne({ projectId, path: filePath });
  if (!file) {
    const err = new Error("file not found");
    err.statusCode = 404;
    throw err;
  }
  return file;
}

async function getTestResults(projectId) {
  return TestRun.find({ projectId }).sort({ createdAt: 1 });
}

async function listRecentRuns(limit = 50) {
  const runs = await TestRun.find({}).sort({ createdAt: -1 }).limit(limit);
  const projects = await Project.find({});
  const nameById = Object.fromEntries(projects.map((p) => [p.projectId, p.name]));
  return runs.map((r) => {
    const plain = typeof r.toObject === "function" ? r.toObject() : r;
    return { ...plain, projectName: nameById[plain.projectId] || plain.projectId };
  });
}

async function getStatus(projectId) {
  const project = await getProject(projectId);
  return { status: project.finalStatus, report: project.report };
}

module.exports = {
  createProject,
  listProjects,
  getProject,
  startGeneration,
  listFiles,
  getFile,
  getTestResults,
  listRecentRuns,
  getStatus,
};