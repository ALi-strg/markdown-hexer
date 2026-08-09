import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/// The debug app binary is platform-specific: `markdown-editor.exe` on
/// Windows, `markdown-editor` on macOS and Linux.
const appBinaryPath = path.resolve(
  __dirname,
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "markdown-editor.exe" : "markdown-editor",
);

/// Custom tauri-service entry that disables the worker's per-command window-focus
/// recovery. That hook calls `browser.tauri.execute()`, which requires the app-side
/// `tauri-plugin-wdio` (window.wdioTauri); without it the service polls ~5s on every
/// element command. The launcher (driver lifecycle) is the stock service unchanged.
const tauriServiceEntry = path.resolve(__dirname, "e2e", "tauri-service.js");

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
        application: appBinaryPath,
      },
    },
  ],
  services: [
    [
      tauriServiceEntry,
      {
        appBinaryPath,
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
    // The E2E build enables the app's test seam (VITE_E2E) so the save spec can
    // bypass the native dialog via localStorage without shipping test hooks in
    // production builds.
    process.env.VITE_E2E = "1";
    // Neutralize an ambient `CI` variable: the tauri CLI maps it onto `--ci`
    // (accepting true/false), so a bare `CI=1` from the shell fails the build
    // before compilation starts.
    spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "tauri", "build", "--", "--debug", "--no-bundle"],
      {
        cwd: path.resolve(__dirname, "."),
        stdio: "inherit",
        shell: true,
        env: { ...process.env, CI: "false" },
      },
    );
  },
};
