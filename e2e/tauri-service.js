import TauriWorkerService, { launcher as TauriLaunchService } from "@wdio/tauri-service";

// @wdio/tauri-service runs a window-focus recovery in its worker `beforeCommand`
// hook that calls `browser.tauri.execute()`. That API requires the app-side
// `tauri-plugin-wdio` (which exposes `window.wdioTauri`) — not shipped here. Without
// the plugin the service polls for it (100 x 50ms) on every `$` / `getTitle` / click,
// spamming the log and stalling each command. This app is single-window, so the focus
// recovery is unnecessary — skip it. Everything else (driver lifecycle, session wiring,
// console forwarding) is inherited unchanged.
class TauriServiceNoFocusRecovery extends TauriWorkerService {
  async beforeCommand(_commandName, _args) {
    return;
  }
}

export { TauriLaunchService as launcher };
export default TauriServiceNoFocusRecovery;
