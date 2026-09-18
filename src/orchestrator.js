const path = require("path");
const { Project, ProjectFile, TestRun, AgentRun } = require("./models");
const { emitEvent } = require("./sse");
const { analyzeRequirement } = require("./agents/requirementAgent");
const { planArchitecture } = require("./agents/architectureAgent");
const { generateProject } = require("./agents/codeGeneratorAgent");
const exec = require("./execution/executionManager");
const { runTests } = require("./agents/testAgent");
const { analyzeFailures } = require("./agents/errorAnalyzer");
const { attemptFix } = require("./agents/debuggerAgent");
const { runQualityChecks, runSecurityChecks } = require("./agents/validationAgent");

const MAX_FIX_ATTEMPTS = 3;

async function recordAgentRun(projectId, agent, input, output, durationMs) {
  await AgentRun.create({ projectId, agent, input, output, durationMs });
}

async function saveFiles(projectId, files) {
  await ProjectFile.deleteMany({ projectId });
  await ProjectFile.insertMany(
    Object.entries(files).map(([p, content]) => ({ projectId, path: p, content }))
  );
}

async function updateFile(projectId, relPath, content) {
  await ProjectFile.updateOne({ projectId, path: relPath }, { content }, { upsert: true });
}

function step(projectId, text, statusIcon = "›") {
  return emitEvent(projectId, { type: "step", icon: statusIcon, text });
}

function ok(projectId, text) {
  return emitEvent(projectId, { type: "ok", icon: "✓", text });
}

function bad(projectId, text) {
  return emitEvent(projectId, { type: "error", icon: "✗", text });
}

async function runPipeline(projectId) {
  const project = await Project.findOne({ projectId });
  if (!project) throw new Error("project not found");

  project.finalStatus = "RUNNING";
  await project.save();

  try {
    // ---------- 1. Requirement Analysis ----------
    step(projectId, "Analyzing requirements...");
    const t0 = Date.now();
    const analysis = await analyzeRequirement(project.requirement);
    await recordAgentRun(projectId, "RequirementAnalyzer", project.requirement, analysis, Date.now() - t0);
    project.analysis = analysis;
    await project.save();
    ok(projectId, `Requirements analyzed (${analysis.source === "llm" ? "via Claude" : "heuristic parser"})`);

    // ---------- 2. Architecture Planning ----------
    step(projectId, "Planning architecture...", "›");
    const architecture = planArchitecture(analysis);
    project.architecture = architecture;
    await project.save();
    ok(projectId, "Architecture created");

    // ---------- 3. Code Generation ----------
    step(projectId, "Generating backend...", "›");
    const files = generateProject({ projectName: project.name, analysis });
    await saveFiles(projectId, files);
    project.generatedFiles = Object.keys(files);
    project.apisCreated = analysis.endpoints.map((e) => `${e.method} ${e.path}`);
    project.modelsCreated = [...(analysis.needsAuth ? ["User"] : []), ...analysis.primaryEntities];
    project.envVars = analysis.needsAuth ? ["PORT", "MONGODB_URI", "JWT_SECRET"] : ["PORT", "MONGODB_URI"];
    await project.save();
    ok(projectId, `Files generated (${Object.keys(files).length} files)`);

    // ---------- 4. Write to isolated workspace ----------
    const workspacePath = path.join(exec.WORKSPACES_ROOT, projectId);
    project.workspacePath = workspacePath;
    await exec.writeFiles(workspacePath, files);
    await project.save();

    // ---------- 5. Install dependencies ----------
    step(projectId, "Installing dependencies...", "›");
    const installResult = await exec.installDependencies(workspacePath, (msg) => step(projectId, msg, "›"));
    if (installResult.code !== 0) {
      bad(projectId, "Dependency installation failed");
      return await finalize(project, {
        status: "FAILED",
        reason: "npm install failed",
        detail: installResult.stderr.slice(-4000),
      });
    }
    ok(projectId, "Dependencies installed");

    // ---------- 6. Isolated execution environment ----------
    const dockerMode = await exec.dockerAvailable();
    step(projectId, dockerMode ? "Starting isolated Docker environment..." : "Starting isolated sandbox (Docker unavailable in this environment — using a sandboxed child process instead)...", "›");

    const testEnv = {
      ...process.env,
      MONGODB_URI: process.env.MONGODB_URI || global.__BACKENDFORGE_MEMDB_URI__,
      JWT_SECRET: analysis.needsAuth ? "test_jwt_secret_for_generated_project" : undefined,
    };

    const handle = await exec.startBackend({
      workspacePath,
      envVars: { MONGODB_URI: testEnv.MONGODB_URI, JWT_SECRET: testEnv.JWT_SECRET || "" },
      dockerMode,
    });

    if (!handle.started) {
      bad(projectId, "Backend failed to start");
      const logs = handle.getLogs ? handle.getLogs() : {};
      return await finalize(project, {
        status: "FAILED",
        reason: "Server did not become healthy within timeout",
        detail: JSON.stringify(logs).slice(-4000),
      });
    }
    ok(projectId, `${dockerMode ? "Container" : "Sandbox process"} started on port ${handle.port}`);
    step(projectId, "Starting backend...", "›");
    ok(projectId, "Server started");

    // We don't need the running server for the Jest/Supertest suite (it builds
    // its own in-memory app via createApp()), so stop this instance now — its
    // only job was to prove the app actually boots outside of the test runner.
    await exec.stopBackend(handle);

    // ---------- 7. Run tests (initial) ----------
    step(projectId, "Running tests...", "›");
    let testResult = await runTests(workspacePath, testEnv);
    await TestRun.create({
      projectId,
      phase: "initial",
      attempt: 0,
      results: testResult.testResults,
      passed: testResult.passed,
      failed: testResult.failed,
      rawOutput: testResult.rawOutput.slice(-8000),
    });

    if (testResult.crash) {
      bad(projectId, "Test suite crashed before producing results");
      return await finalize(project, { status: "FAILED", reason: "Jest crashed", detail: testResult.rawOutput.slice(-4000) });
    }

    reportEachTest(projectId, testResult.testResults);

    // ---------- 8-12. Debug loop ----------
    let attempt = 0;
    const fixLog = [];
    const filesChanged = new Set();

    while (testResult.failed > 0 && attempt < MAX_FIX_ATTEMPTS) {
      attempt++;
      const failures = analyzeFailures(testResult.testResults);
      const firstFailure = failures[0];

      step(projectId, `Analyzing failure (attempt ${attempt}/${MAX_FIX_ATTEMPTS}): ${firstFailure.title}`, "›");

      const fix = await attemptFix({ workspacePath, failure: firstFailure });
      if (!fix) {
        bad(projectId, `No confident automatic fix found for: ${firstFailure.title}`);
        fixLog.push({ attempt, failure: firstFailure.title, applied: false });
        break;
      }

      filesChanged.add(fix.file);
      const newContent = await require("fs/promises").readFile(path.join(workspacePath, fix.file), "utf8");
      await updateFile(projectId, fix.file, newContent);
      fixLog.push({ attempt, failure: firstFailure.title, applied: true, file: fix.file, description: fix.description, method: fix.method });
      step(projectId, `Fixing ${fix.file}: ${fix.description}`, "›");

      step(projectId, "Retesting...", "›");
      testResult = await runTests(workspacePath, testEnv);
      await TestRun.create({
        projectId,
        phase: "retest",
        attempt,
        results: testResult.testResults,
        passed: testResult.passed,
        failed: testResult.failed,
        rawOutput: testResult.rawOutput.slice(-8000),
      });

      if (testResult.crash) {
        bad(projectId, "Test suite crashed after fix attempt");
        break;
      }

      const stillFailing = testResult.testResults.find((t) => t.title === firstFailure.title && t.status === "failed");
      if (!stillFailing) {
        ok(projectId, `${firstFailure.title} passed`);
      } else {
        bad(projectId, `${firstFailure.title} still failing after fix attempt ${attempt}`);
      }
    }

    project.fixAttempts = fixLog;
    project.filesChangedDuringDebug = [...filesChanged];
    await project.save();

    // ---------- 13. Regression testing ----------
    step(projectId, "Running regression tests...", "›");
    const regressionResult = await runTests(workspacePath, testEnv);
    await TestRun.create({
      projectId,
      phase: "regression",
      attempt,
      results: regressionResult.testResults,
      passed: regressionResult.passed,
      failed: regressionResult.failed,
      rawOutput: regressionResult.rawOutput.slice(-8000),
    });

    if (regressionResult.failed === 0 && !regressionResult.crash) {
      ok(projectId, "All tests passed");
    } else {
      bad(projectId, `${regressionResult.failed} test(s) still failing after regression run`);
    }

    // ---------- 14. Quality checks ----------
    step(projectId, "Running quality checks...", "›");
    const quality = await runQualityChecks(workspacePath);
    ok(projectId, `Quality check complete (${quality.issues.length} issue(s) found)`);

    // ---------- 15. Security checks ----------
    step(projectId, "Running security checks...", "›");
    const security = await runSecurityChecks(workspacePath);
    ok(projectId, "Security check complete");

    // ---------- Final verification ----------
    const criticalTestsPassed = regressionResult.failed === 0 && !regressionResult.crash;
    const securityHasFailure = security.findings.some((f) => f.level === "fail");
    let finalStatus;
    if (criticalTestsPassed && !securityHasFailure) finalStatus = "VERIFIED";
    else if (regressionResult.crash || installResult.code !== 0) finalStatus = "FAILED";
    else finalStatus = "NOT_VERIFIED";

    const report = {
      filesGenerated: true,
      dependenciesInstalled: installResult.code === 0,
      build: installResult.code === 0,
      serverStartup: handle.started,
      dockerMode,
      apiTests: { passed: regressionResult.passed, total: regressionResult.total },
      regressionTests: criticalTestsPassed,
      codeQuality: quality,
      security,
      apisCreated: project.apisCreated,
      modelsCreated: project.modelsCreated,
      fixAttempts: fixLog,
      filesChangedDuringDebug: [...filesChanged],
      requiredEnvVars: project.envVars,
      howToRun: `cd generated project directory\nnpm install\ncp .env.example .env\nnpm start`,
      status: finalStatus,
    };

    project.finalStatus = finalStatus;
    project.report = report;
    await project.save();

    emitEvent(projectId, { type: "final", icon: finalStatus === "VERIFIED" ? "✓" : finalStatus === "FAILED" ? "✗" : "!", text: `Backend ${finalStatus}`, report });

    return report;
  } catch (err) {
    bad(projectId, `Pipeline error: ${err.message}`);
    return await finalize(project, { status: "FAILED", reason: err.message, detail: err.stack });
  }
}

function reportEachTest(projectId, testResults) {
  for (const t of testResults) {
    if (t.status === "passed") ok(projectId, `${t.title} passed`);
    else if (t.status === "failed") bad(projectId, `${t.title} failed`);
  }
}

async function finalize(project, { status, reason, detail }) {
  project.finalStatus = status;
  project.report = { status, reason, detail };
  await project.save();
  emitEvent(project.projectId, { type: "final", icon: "✗", text: `Backend ${status}: ${reason}`, report: project.report });
  return project.report;
}

module.exports = { runPipeline };