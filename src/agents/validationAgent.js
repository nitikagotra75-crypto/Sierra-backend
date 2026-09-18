const fs = require("fs/promises");
const path = require("path");

const SECRET_LITERAL_RE = /(JWT_SECRET|SECRET|PASSWORD|API_KEY)\s*[:=]\s*["'][^"']{4,}["']/i;

async function readIfExists(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch (e) {
    return null;
  }
}

async function walkJsFiles(dir, root, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkJsFiles(full, root, out);
    } else if (entry.name.endsWith(".js")) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

/**
 * Real static checks against the actual generated source files — not a
 * simulated/pretend quality report. Looks for unused requires, stray
 * console.logs, and oversized controllers.
 */
async function runQualityChecks(workspacePath) {
  const files = await walkJsFiles(workspacePath, workspacePath);
  const issues = [];

  for (const rel of files) {
    const content = await fs.readFile(path.join(workspacePath, rel), "utf8");
    const lines = content.split("\n");

    const requireRe = /const\s+\{?\s*([A-Za-z0-9_,\s]+)\s*\}?\s*=\s*require\(/g;
    let m;
    while ((m = requireRe.exec(content))) {
      const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const name of names) {
        const usageCount = content.split(new RegExp(`\\b${name}\\b`)).length - 1;
        if (usageCount <= 1) {
          issues.push({ file: rel, type: "unused-import", detail: `'${name}' is imported but not used` });
        }
      }
    }

    lines.forEach((line, i) => {
      if (/console\.log\(/.test(line) && !rel.includes("server.js") && !rel.includes("db.js")) {
        issues.push({ file: rel, type: "stray-console-log", detail: `console.log at line ${i + 1}` });
      }
    });

    if (rel.endsWith("Controller.js") && lines.length > 250) {
      issues.push({ file: rel, type: "large-file", detail: `${lines.length} lines — consider splitting` });
    }
  }

  return { issues, filesChecked: files.length };
}

/**
 * Basic, real security checks on the actual generated project. Deliberately
 * conservative in its claims — this is NOT a substitute for a real security
 * audit, and the report says so explicitly.
 */
async function runSecurityChecks(workspacePath) {
  const findings = [];

  const jsFiles = await walkJsFiles(workspacePath, workspacePath);
  let hardcodedSecretFound = false;
  // Test files legitimately contain dummy credentials (e.g. `password = "password123"`)
  // used only to exercise auth endpoints — these are not real secrets, so they're
  // excluded from this scan to avoid false positives.
  const isTestFile = (rel) => /(^|[\\/])tests?[\\/]/i.test(rel) || /\.test\.js$/i.test(rel) || /\.spec\.js$/i.test(rel);
  for (const rel of jsFiles) {
    if (isTestFile(rel)) continue;
    const content = await fs.readFile(path.join(workspacePath, rel), "utf8");
    if (SECRET_LITERAL_RE.test(content)) {
      hardcodedSecretFound = true;
      findings.push({ level: "fail", check: "hardcoded-secrets", detail: `Possible hardcoded secret in ${rel}` });
    }
  }
  if (!hardcodedSecretFound) {
    findings.push({ level: "pass", check: "hardcoded-secrets", detail: "No hardcoded secrets detected in source files" });
  }

  const authService = await readIfExists(path.join(workspacePath, "src/services/authService.js"));
  if (authService) {
    const usesBcrypt = /bcrypt\.(hash|compare)/.test(authService);
    const storesRawPassword = /passwordHash\s*:\s*password[^H]/.test(authService);
    if (usesBcrypt && !storesRawPassword) {
      findings.push({ level: "pass", check: "password-handling", detail: "Passwords are hashed with bcrypt before storage" });
    } else {
      findings.push({ level: "fail", check: "password-handling", detail: "Password hashing could not be confirmed" });
    }
  }

  const appJs = await readIfExists(path.join(workspacePath, "src/app.js"));
  if (appJs && /cors\(\)/.test(appJs)) {
    findings.push({ level: "warn", check: "cors", detail: "CORS is enabled with default (permissive) settings — restrict allowed origins before production use" });
  }

  const envExample = await readIfExists(path.join(workspacePath, ".env.example"));
  if (envExample && /JWT_SECRET=.{20,}/.test(envExample) && !/changeme|example|placeholder/i.test(envExample)) {
    findings.push({ level: "warn", check: "env-example", detail: ".env.example may contain a real-looking secret rather than a placeholder" });
  } else if (envExample) {
    findings.push({ level: "pass", check: "env-example", detail: ".env.example uses placeholder values" });
  }

  const errorHandler = await readIfExists(path.join(workspacePath, "src/middleware/errorHandler.js"));
  if (errorHandler && !/err\.stack/.test(errorHandler)) {
    findings.push({ level: "pass", check: "error-exposure", detail: "Error responses do not include stack traces" });
  }

  return {
    findings,
    disclaimer:
      "This is a basic automated scan (hardcoded secrets, password hashing, CORS, error exposure). It is not a substitute for a full security audit.",
  };
}

/**
 * Runs both quality and security checks. This is the single "validation"
 * step in the pipeline — quality and security are two angles on the same
 * question (is this code okay to ship), so they live in one agent.
 */
async function runValidation(workspacePath) {
  const [quality, security] = await Promise.all([runQualityChecks(workspacePath), runSecurityChecks(workspacePath)]);
  return { quality, security };
}

module.exports = { runQualityChecks, runSecurityChecks, runValidation };