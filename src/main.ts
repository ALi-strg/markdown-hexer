import { createApp } from "vue";
import { createPinia } from "pinia";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.vue";
import "./styles.css";
import "./prism-theme.css";
import "./print.css";

createApp(App).use(createPinia()).mount("#app");

// The window ships `visible: false` to hide the WebView2 white flash while
// the app boots. Show it after the first Vue render has painted; the Rust
// watchdog in lib.rs shows it after 5s in case this path never runs.
// Two animation frames: Vue's async component tree finishes on the first,
// CodeMirror/pane layout paints on the second.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    void getCurrentWindow().show();
  });
});
