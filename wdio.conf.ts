import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function killOrphanedDrivers() {
  if (process.platform !== "win32") {
    return;
  }
  // tauri-driver is spawned through cmd.exe (shell: true) by @wdio/native-core,
  // so the service's own stop() only kills the wrapper, orphaning the real
  // tauri-driver.exe (and its msedgedriver child). Force-kill the whole tree.
  try {
    execSync("taskkill /IM tauri-driver.exe /T /F", { stdio: "ignore" });
  } catch {
    // no orphaned driver
  }
}

export const config = {
  runner: "local",
  specs: ["./e2e/specs/**/*.ts"],
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application:
          "./src-tauri/target/debug/markdown-editor.exe",
      },
    },
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: "./src-tauri/target/debug/markdown-editor.exe",
        autoInstallTauriDriver: false,
        autoDownloadEdgeDriver: true,
        tauriDriverPort: 4444,
        driverProvider: "external",
        logLevel: "info",
      },
    ],
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120000,
  },
  logLevel: "info",
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 2,
  onComplete: () => {
    killOrphanedDrivers();
  },
  onPrepare: () => {
    killOrphanedDrivers();
    spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "tauri", "build", "--", "--debug", "--no-bundle"],
      { cwd: path.resolve(__dirname, "."), stdio: "inherit", shell: true },
    );
  },
};
