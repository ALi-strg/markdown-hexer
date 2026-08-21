# House design language with independent Palettes

## Status

Accepted

## Context

Markdown Hexer is the desktop app linked from the House-styled alitools-pages. Its download page now uses the House style, but the app chrome previously used rounded controls, system UI typography, and a warm Light palette. That made the app screenshots and the product pages feel like separate products.

The app already supports multiple color Palettes. Light, Dark, High Contrast, Nord, and Terminal Green are deliberate choices, and System resolves to Light or Dark from the operating system. Replacing Light would remove an existing visual choice and would make the default behavior less familiar.

The House style also contains page-specific elements, such as giant display type and hero visuals. Those do not belong in a distraction-free editor.

## Decision

Markdown Hexer adopts the alitools-pages House style as its global **Design language** for app chrome:

- the UI uses the House sans-serif stack, with monospace uppercase micro-labels where chrome labels are needed;
- borders remain hairlines;
- chrome surfaces have no radius or shadow;
- the House page typography is not copied wholesale: giant display type and hero layouts stay on the sites.

Palettes remain independent from the Design language. The app now has six curated Palettes:

- Light, the existing warm beige scheme and the light result of System;
- House, the cool paper, green-gray ink, sage accent scheme;
- Dark;
- High Contrast;
- Nord;
- Terminal Green.

Editor Pane and Preview Pane content fonts remain controlled by the existing Font picker. The House syntax colors reuse the readable GitHub-light token values used by Light.

The intended download page screenshot set is Light, High Contrast, and House. The former Nord screenshot will be replaced by a House screenshot after a desktop capture.

## Consequences

The app reads as part of the alitools-pages family in every Palette without forcing every Palette to use the House colors. Existing users keep their Light, Dark, High Contrast, Nord, and Terminal Green choices. The default light appearance remains unchanged.

The global chrome restyle touches controls, tabs, dialogs, code surfaces, and the toast. Screenshots need to be regenerated after the restyle. Product copy must describe six curated Palettes, not five. The screenshot files remain a manual capture task because the repository has no screenshot-generation command.

The House token values are duplicated from the alitools-pages canonical token set. `docs/theme-mapping.md` records that mapping and the app-specific role adjustments. No automated mirror guard is added yet; a future token change can add one when the duplicated values start to drift.
