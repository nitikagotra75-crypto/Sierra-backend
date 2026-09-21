const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const getPort = require("get-port");

const WORKSPACES_ROOT = path.join(__dirname, "..", "..", "workspaces");

async function writeFiles(workspacePath, files) {
  await fs.mkdir(workspacePath, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(workspacePath, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }
}

function runCommand(cmd, args, { cwd, env, timeoutMs = 120000 }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, shell: true});
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -1, stdout, stderr: stderr + "\n[TIMEOUT] command exceeded " + timeoutMs + "ms", timedOut: true });
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + "\n" + err.message, timedOut: false });
    });
  });
}

async function dockerAvailable() {
  try {
    const Docker = require("dockerode");
    const docker = new Docker();
    await docker.ping();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Installs dependencies for the generated project. Real `npm install`, always —
 * this step doesn't depend on Dock
async function installDependencies(workspacePath, onLog) {
  onLog && onLog("Running npm install...");
  const result = await runCommand("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"], {
    cwd: workspacePath,
    env: process.env,
    timeoutMs: 300000,
  });
  return result;
}

async function startBackend({ workspacePath, envVars, dockerMode }) {
  const port = await getPort({ port: getPort.makeRange(4100, 4999) });
  const runtimeEnv = {
    PATH: process.env.PATH,
    PORT: String(port),
    ...envVars,
  };

  if (dockerMode) {
    // Real dockerode path (used automatically when a Docker daemon is present).
    const Docker = require("dockerode");
    const docker = new Docker();
    const imageTag = `backendforge-${path.basename(workspacePath)}`.toLowerCase();
    const buildResult = await runCommand("docker", ["build", "-t", imageTag, "."], { cwd: workspacePath, env: process.env, timeoutMs: 180000 });
    if (buildResult.code !== 0) {
      return { mode: "docker", started: false, port, buildResult };
    }
    const container = await docker.createContainer({
      Image: imageTag,
      Env: Object.entries(runtimeEnv).map(([k, v]) => `${k}=${v}`),
      ExposedPorts: { "4000/tcp": {} },
      HostConfig: {
        PortBindings: { "4000/tcp": [{ HostPort: String(port) }] },
        Memory: 512 * 1024 * 1024,
        NetworkMode: "bridge",
      },
    });
    await container.start();
    return { mode: "docker", started: true, port, container, buildResult };
  }

  // Local sandbox fallback (this build environment).
  const child = spawn("node", ["src/server.js"], {
    cwd: workspacePath,
    env: runtimeEnv,
    shell: false,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  const ready = await waitForHealth(port, 15000);

  return {
    mode: "local-sandbox",
    started: ready,
    port,
    process: child,
    getLogs: () => ({ stdout, stderr }),
  };
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch (e) {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function stopBackend(handle) {
  if (!handle) return;
  if (handle.mode === "docker" && handle.container) {
    try {
      await handle.container.stop({ t: 2 });
      await handle.container.remove();
    } catch (e) {
      /* best-effort cleanup */
    }
  } else if (handle.process) {
    try {
      handle.process.kill("SIGKILL");
    } catch (e) {
      /* already dead */
    }
  }
}

module.exports = {
  WORKSPACES_ROOT,
  writeFiles,
  runCommand,
  dockerAvailable,
  installDependencies,
  startBackend,
  stopBackend,
  waitForHealth,
};
