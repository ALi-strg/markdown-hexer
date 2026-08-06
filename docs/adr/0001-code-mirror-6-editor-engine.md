# CodeMirror 6 as the editor engine

The editor pane is built on CodeMirror 6 rather than a plain `<textarea>` or a contenteditable widget. CodeMirror's block-based view model, real undo stack (survives programmatic toolbar edits), and per-position block coordinates make high-quality synced scrolling and selection-based formatting achievable; a `<textarea>` would degrade sync scroll to proportional estimation and make toolbar operations fragile. Contenteditable was rejected because it collapses the source-editor + rendered-preview model into a single rich-text pane.
