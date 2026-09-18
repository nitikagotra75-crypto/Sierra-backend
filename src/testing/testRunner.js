const path = require("path");
const { runCommand } = require("../execution/executionManager");

async function runTests(workspacePath, env) {
  const jestBin = path.join("node_modules", "jest", "bin", "jest.js");
  const result = await runCommand(
    "node",
    [jestBin, "--json", "--runInBand", "--forceExit", "--outputFile=jest-results.json"],
    { cwd: workspacePath, env, timeoutMs: 90000 }
  );

  let parsed = null;
  try {
    const fs = require("fs");
    const raw = fs.readFileSync(path.join(workspacePath, "jest-results.json"), "utf8");
    parsed = JSON.parse(raw);
  } catch (e) {
    // Jest crashed before producing a report (e.g. syntax error, server never started).
    return {
      ranSuccessfully: false,
      passed: 0,
      failed: 0,
      total: 0,
      testResults: [],
      rawOutput: result.stdout + "\n" + result.stderr,
      crash: true,
    };
  }

  const testResults = [];
  for (const suite of parsed.testResults || []) {
    for (const t of suite.assertionResults || []) {
      testResults.push({
        file: path.relative(workspacePath, suite.name),
        title: t.fullName || t.title,
        status: t.status, // "passed" | "failed" | "pending"
        failureMessages: t.failureMessages || [],
      });
    }
  }

  return {
    ranSuccessfully: true,
    passed: parsed.numPassedTests,
    failed: parsed.numFailedTests,
    total: parsed.numTotalTests,
    testResults,
    rawOutput: result.stdout + "\n" + result.stderr,
    crash: false,
  };
}

module.exports = { runTests };