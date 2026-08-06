import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles.css";
import "./prism-theme.css";

createApp(App).use(createPinia()).mount("#app");
