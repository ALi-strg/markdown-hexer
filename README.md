# ALi-md-editor

A distraction-free native Markdown editor built with Tauri 2, Vue 3, and CodeMirror 6.

See `docs/PRD.md` for the product specification and `docs/slices/` for the incremental build plan.

## Development

```sh
npm install
npm run tauri dev
```

## Tests

```sh
npm test        # Vitest (Pinia stores, components)
npm run test:e2e # WebdriverIO + tauri-driver smoke/E2E suite
cargo test      # Rust backend unit tests
```
