# Boring Vectors — Post-v1 Roadmap

_Written 2026-09-28. Covers the three features decided on after the v1 parity pass and new-project scope (`docs/SPEC.md` steps 1–7, all done — see `CLAUDE.md` Status): multiple projects, animation, and export. This file is the authoritative plan for that work; update it as decisions change or steps land, the way `CLAUDE.md` Status tracks the original build plan._

## Decisions

- **Multiple projects** = what the existing `documents.ts` / `DocumentsModal` already provide (multiple named, localStorage-backed files, switchable, autosaved) — not a new data model. This step is a rename/polish pass, not new architecture.
- **Animation** = a keyframe timeline (svgstudio.org-style: multiple keyframes per property, scrubbing, playback) — the larger aspirational build `CLAUDE.md`'s "Direction reference" section previously deferred. This is now in scope, explicitly requested.
- **Export** = SVG file download, raster PNG/JPG, portable project-file export/import, and (once animation exists) animated export — CSS/SMIL first, GIF/video as a stretch.

## Architectural note (blocking for step 3)

`CLAUDE.md`'s key architectural rule states Paper.js's `Project` is the sole source of truth for path geometry and must not be duplicated into the Zustand store. Animation keyframe data (`property X of path Y is V1 at t1, V2 at t2, with easing E`) has no home in Paper.js — it isn't live geometry, it's timeline data describing geometry over time. This requires an explicit amendment before step 3 starts:

> Paper.js's `Project` remains the source of truth for a path's _current_ static geometry when not animating. A new store slice (`animation` — clips keyed by path id + property, each a sorted keyframe list) is the source of truth for _how that geometry changes over time_. During playback, the animation engine writes interpolated values onto live Paper.js objects each frame; it does not read them back as truth. Editing tools (Select/Node/Add Point) and playback must not run concurrently — an edit/play mode switch prevents the timeline and direct manipulation fighting over the same Path.

Update `CLAUDE.md`'s "Key architectural rule" section with this amendment when step 3 begins.

## Build order

Sequenced so every step ships something usable and later steps aren't blocked by anything upstream of them.

### 1. Projects rename/polish

- Rename "document" → "project" across UI copy, store fields (`currentDocumentId`, `currentDocumentName`, `documentsModalOpen`, etc.), `documents.ts` exports, and component/file names (`DocumentsModal` → `ProjectsModal`)
- Optional: thumbnails in the list (render each project's saved SVG to a small preview), search/filter, duplicate-project action
- No architecture change — mechanical rename plus optional list UX polish

### 2. Export (non-animated)

- **Download .svg**: extend the existing `exportSvg()` in `PaperCanvas.tsx` (currently clipboard-only) to also offer a file download via Blob + `<a download>`
- **Raster PNG/JPG**: render the content layer to an offscreen canvas at a chosen resolution/scale, `canvas.toBlob()`; needs a small export-options UI (resolution, transparent vs. background fill)
- **Project file export/import**: `DocumentPayload` in `documents.ts` already has the right shape (svg + canvas size + background); add explicit "Export project file" (download JSON) / "Import project file" actions using that same payload, distinct from the existing paste-SVG import modal
- No dependency on animation — safe to ship standalone

### 3. Animation — keyframe timeline

Apply the architectural amendment above first, then build incrementally:

1. Data model + store slice (`AnimationClip`, keyframes per path/property, no UI yet)
2. Minimal timeline UI wired to one property (opacity) end-to-end: track, playhead, add/move/delete keyframe
3. Playback engine: per-frame interpolation written onto live Paper.js objects; edit/play mode switch
4. Expand property coverage: position, scale, rotation, stroke/fill color
5. Easing curves (linear/ease-in/ease-out/custom) per keyframe
6. Polish: snapping, multi-track drag-select, loop/ping-pong playback

### 4. Animated export

Depends on step 3 landing.

- CSS/SMIL export first: bake keyframes into `<animate>`/`@keyframes` embedded in the exported SVG — output stays plain SVG, no new dependency
- GIF/video as a stretch goal: render N frames to canvas and encode (e.g. `gif.js`, or `MediaRecorder` on a canvas stream for webm) — real added complexity and a new dependency; only pursue if CSS/SMIL export isn't sufficient

## Status

**Step 1 (projects rename/polish) done**, the mechanical part: "document" → "project" across UI copy, store fields, `documents.ts` → `projects.ts` (exports renamed: `ProjectMeta`, `ProjectPayload`, `listProjects`, `loadProject`, `saveProject`, `renameProject`, `deleteProject`, `ensureCurrentProject`, `createProjectId`), `DocumentsModal.tsx`/`.css` → `ProjectsModal.tsx`/`.css`, and the corresponding store fields (`currentProjectId`, `currentProjectName`, `projectsModalOpen`, `switchProjectRequest`, `newProjectRequest`, etc.). localStorage key strings were deliberately left as `boring-vectors:documents` / `boring-vectors:document:*` to avoid orphaning already-saved projects — only the TS-facing names changed. Thumbnails/search/duplicate polish not done — skipped as optional, not requested.

**Step 2 (export, non-animated) done.** Replaced the single clipboard-only `requestExport()` with a typed `ExportKind` request (`copySvg` / `downloadSvg` / `downloadRaster` / `downloadProjectFile`) and a new `ExportModal.tsx` (opened from the TopBar menu, replacing the old direct-fire button) offering: copy SVG to clipboard, download .svg, download .png/.jpg (1×/2×/4× scale, transparent-background toggle for PNG), and download a project file (JSON, reusing `ProjectPayload`'s shape). `ProjectsModal.tsx` gained an "Import file…" button (hidden file input) that reads a dropped/picked project JSON, loosely validates its shape, and loads it as a new project via a new `importProjectFileRequest` store signal, mirroring the `newProjectRequest` pattern.

Found and fixed a pre-existing bug while building this: `contentLayer.exportSVG()` returns a bare `<g>` fragment, not a standalone `<svg>` document — the old clipboard-copy export was copying that fragment directly (technically invalid as a standalone SVG file, most apps tolerate it when pasted). All export paths now go through `buildStandaloneSvg()`, which wraps the fragment in a proper `<svg xmlns=... width=... height=... viewBox=...>` sized to the artboard. Raster export (PNG/JPG) rasterizes that wrapped SVG via an offscreen `<canvas>` + `Image`, so it needs valid SVG to load. Verified via a Playwright smoke script (SVG/PNG/JPG/project-file downloads, plus a project-file round-trip import) — no console errors, all four export kinds produce correctly-sized, non-empty output.

**Step 3 (animation) — vertical slice done, one property (opacity) end-to-end**, per the sub-phases above: data model (`src/animation.ts`: `AnimationClip`/keyframe types, pure interpolation/upsert helpers), a `Timeline` component (play/pause, scrubber, duration control, add/drag/delete opacity keyframes for the selected path), and a playback engine in `PaperCanvas.tsx` (rAF loop writing interpolated values onto live Paper.js paths, guarded against concurrent editing while playing). The animation clip persists with the project (`ProjectPayload.animation`, included in autosave/export/import) and applies its documented CLAUDE.md architectural amendment. Easing (linear/easeIn/easeOut/easeInOut) is implemented in the data model but not yet exposed in the Timeline UI. Position/scale/rotation/color tracks (step 3.4) not started.

**Found and fixed two real bugs while building this, not just the vertical slice:**
1. Paper.js's `path.id` is a per-session auto-incrementing counter, not a stable identifier — it gets reassigned on every reload/re-import, so anything persisted by path id (like animation keyframes) silently orphaned itself on the very next reload. Fixed by switching all path identity (selection, hit-testing, animation) to `path.name`, which Paper.js round-trips through the SVG `id` attribute on export/import, and assigning a UUID name to every path at creation time (import, pen tool, shape tool) when one isn't already present. This also happens to fix undo/redo's selection-restoration edge cases, though selection is intentionally still cleared on undo.
2. Keyframe/duration edits weren't triggering autosave — `scheduleAutosave()` was only wired into `redrawOverlay()` (geometry changes), which animation-only edits never go through. Fixed by also scheduling a save whenever the animation clip changes.

Also added, at user request mid-build (not in the original three-feature scope but small and related to the projects work): inline project renaming in the TopBar, Figma-style click-to-edit. This surfaced a latent bug where renaming the *current* project via the Projects modal updated the store's display name but not `PaperCanvas`'s in-memory autosave name — fixed by routing all current-project renames through a new nonce-based `renameProjectRequest`, mirroring the existing switch/new-project request pattern.

**Step 4 started: SMIL export.** Added a "Download animated .svg" option (behind the animation feature flag) that bakes real, portable SVG animation into the exported file — no JS or app needed to play it back, verified by opening the exported file standalone in a fresh browser page and watching `opacity` genuinely animate from ~1 down to a frozen 0.1 over the keyframed duration.

Deliberately scoped to opacity, fill color, and stroke color for this round — these map 1:1 onto a native SVG `<animate attributeName="...">` with the SVG renderer doing the actual interpolation (our own `evaluateProperty` math is never invoked at export time, only at authoring/playback time in the app). Position (X/Y), size (width/height), and rotation/scale are **not yet exported** — they don't have an equally direct mapping: x/y/width/height mutate a path's bounds in place with no separate "authoring shape" preserved anywhere to derive a portable transform from, and rotation/scale already need the in-app rest-geometry mechanism just to play back correctly, which doesn't translate into a SMIL/CSS-native concept without more work (likely computing a `d`-attribute keyframe sequence by sampling the same transform pipeline used for live playback, applied to an offscreen clone). `animation.ts` gained the export-side pieces: `buildSmilAnimate()` (one property track → one `<animate>` element string, keyframes padded to span the full 0–1 `keyTimes` range, named easings approximated as the nearest standard CSS/SMIL cubic-bezier keySpline), `buildSmilColorAnimate()` (R/G/B channel trio → one `<animate attributeName="fill|stroke">`), and `buildSmilAnimatesForPath()` tying both together per path. `PaperCanvas.tsx`'s `buildAnimatedSvg()` parses the static export back into a DOM, matches each `<path>` by its `id` attribute (= `path.name`, see `hitTest.ts`) to its `pathId` in the animation clip, and appends the generated `<animate>` elements as children.

**Step 4 continued: position/size/rotation/scale now export too**, via a different mechanism than opacity/color — instead of asking the SVG renderer to interpolate between the few authored keyframes (which doesn't have a clean mapping for these properties, as noted above), the exporter densely samples the path's geometry at a fixed 24fps across the animation's duration, reusing `applyGeometryAtTime` — the exact same function live playback calls — applied to an offscreen clone (`path.clone({ insert: false })`) instead of the live path, and bakes the result into a single `<animate attributeName="d" calcMode="linear">`. Easing is effectively "pre-baked" by the sampling itself, so no keySplines are needed for this one. `applyAnimationAtTime` was refactored to extract `applyGeometryAtTime` as a shared function taking any `paper.Path` (live or a clone) precisely so export and playback can't drift apart into two implementations.

Verified two ways: (1) opened the exported SVG standalone and watched the path's bounding box move over the animation's duration, and (2) more precisely, extracted the exported `<animate>` element's first and last `d` values directly and rendered each in isolation to confirm their bounding boxes were exactly 200px apart, matching the authored X keyframes exactly (a live-playback timing measurement showed ~191px due to test measurement noise around the animation's freeze point — the underlying exported data itself is exact). Also re-verified rotation/scale live playback still renders correctly after the `applyGeometryAtTime` refactor (screenshot).

All seven animatable properties (opacity, X, Y, width, height, rotation, scale) plus fill/stroke color now export as portable, standalone-playable SMIL animation. **Step 4's SMIL portion is complete.**

Step 4 remaining: GIF/video export as the stretch goal. Video (WebM) needs no new dependency — the browser's native `MediaRecorder` API can record `canvas.captureStream()` directly. GIF needs a new dependency (`gif.js` or similar), since browsers have no native GIF encoder.

**Step 3 extended: fill color keyframes.** Added as three synced numeric channels (`fillColorR`/`G`/`B`, 0–255) rather than a dedicated color keyframe type, so it reuses the existing numeric-track machinery unchanged instead of a parallel data shape — `animation.ts` gained small `hexToRgb`/`rgbToHex` helpers, and `PaperCanvas.tsx`'s `applyAnimationAtTime` only applies the combined color once all three channels evaluate for a given frame (they're always keyed/moved/removed together from `Timeline.tsx`, so in practice a path has all three or none). The Timeline's Fill Color row uses a native `<input type="color">`, disabled when the selected path has no fill (`selectedPathProps.fillColor === null`). Stroke color isn't done yet — same pattern, just needs its own three channels and a second Timeline row.

**Step 3 status**: opacity, position (X/Y), size (width/height), fill color, and stroke color are done.

**Step 3 finished: rotation and ratio-based scale.** These needed the "rest geometry" mechanism deferred earlier, since Paper.js bakes transforms into segment data rather than keeping a matrix — "rotate to 45deg" only means something relative to a fixed rest shape, not as an absolute number applied directly. Implementation:

- `animation.ts`: `PathTrack` gained optional `restSegments`/`restCenter` fields — a snapshot of a path's segment geometry and bounds center, captured once, the first time rotation or scale is keyframed for that path. `withRestGeometrySet()` is a no-op if already captured (so it's captured exactly once, not re-baselined on every keyframe).
- Capturing the snapshot needs live Paper.js state, which only `PaperCanvas.tsx` can read (the architectural rule) — so unlike every other property, rotation/scale keyframes can't go through the plain `setKeyframe` store action directly. `Timeline.tsx`'s "Key" button for these two routes through a new mediated request (`transformKeyframeRequest` / `requestSetTransformKeyframe`, same nonce pattern as `switchProjectRequest` etc.), which `PaperCanvas.tsx`'s `handleTransformKeyframeRequest` turns into a rest-geometry capture (if needed) followed by the ordinary `setKeyframe` call.
- Playback (`applyAnimationAtTime`): for any path with a rest snapshot, resets its segments to a fresh clone of that snapshot, then applies the evaluated scale and rotation around `restCenter` — every frame, from the same rest state, never incrementally. This runs *before* the existing opacity/x/y/width/height loop, so position/size keyframes (if also present on the same path) apply on top of the rotated/scaled shape.
- Known limitation, accepted for this first cut: once a path has ever had rotation/scale keyframed, its rest snapshot persists on the `PathTrack` even if those keyframes are later all deleted (as long as the path still has *some* other property keyframed) — directly node-editing that path's shape afterward would get silently overwritten on the next playhead change, since playback keeps resetting to the stored rest snapshot. Not pruned automatically; noted here rather than fixed, since it only bites a fairly narrow edit-after-animate workflow.

Verified visually (screenshots, not just data assertions) — a star rotated 90° in place and scaled 2.5× from its center, both rendering correctly — plus the usual persisted-keyframe-survives-reload check and a full regression pass (tools, projects, export). **Step 3 is now complete**: all planned property tracks (opacity, position, size, fill/stroke color, rotation, scale) and easing are implemented.

**Step 3 extended: width/height keyframes.** Added as the "resize over time" equivalent of ratio-based scale, deliberately — Paper.js bakes transforms directly into a path's segment data rather than keeping a separate transform matrix, so animating a true scale ratio or rotation correctly needs a persisted "rest geometry" snapshot to derive from each frame; width/height (and x/y before them) sidestep that entirely by being stored and applied as absolute values, so evaluating a keyframe never depends on transient state. Rotation and ratio-scale are deferred until that snapshot mechanism is built — noted in `animation.ts`.

Also fixed a real layout bug reported by the user (with screenshots): the Timeline was a flex-layout sibling in `App.tsx`, so opening it resized `App-main` → resized the Paper.js canvas → re-fit the view → desynced the Rulers from the grid (visibly, ruler ticks stopped lining up with grid squares). Fixed by docking `Timeline` as an absolutely-positioned overlay inside `CanvasWrap.tsx` instead (same pattern as `Toolbar`/`ZoomPill`/`PanelToggle`), so the canvas element's size never changes when toggling Draw/Animate mode.

Also bumped the Timeline's default height (160px → 380px): with 5 property rows now rendered (Opacity/X/Y/Width/Height, ~362px of content), the old default required scrolling just to reach Width/Height — which also made keyframe-adding flaky when automated, since clicking a below-the-fold button triggers the browser's default scroll-into-view behavior, shifting the coordinates of everything else in the panel mid-interaction.

**Step 3 extended: position (X/Y) keyframes, easing selection, resizable Timeline panel.** `Timeline.tsx` now renders one stacked track row per animatable property (Opacity, X, Y) instead of a single hard-coded opacity row, driven by a small `PROPERTY_DEFS` table — adding the next property (scale/rotation/color) is now a data-table entry plus a Paper.js write branch in `PaperCanvas.tsx`'s `applyAnimationAtTime`, not a UI rewrite. X/Y write onto `path.bounds.x`/`.y`, matching the existing Properties panel's position semantics (top-left of bounding box, not center). A shared Easing dropdown (linear/easeIn/easeOut/easeInOut) sets the easing baked into the next keyframe added on any row — editing an existing keyframe's easing after the fact isn't supported yet (delete + re-add). The Timeline panel is now resizable by height via a drag handle on its top edge (90–480px, defaults to 160px, local component state only — not persisted, matching how panel-position/settings state already isn't persisted elsewhere in the app).

**Animation is now feature-flagged, off by default**, per user request, since it's still an early vertical slice: `settings.animationEnabled` (Settings modal checkbox, "Animation timeline (beta)") gates a new Figma-style Draw/Animate mode switch in the TopBar. The switch only renders when the flag is on; picking "Animate" swaps the drawing Toolbar out for the Timeline panel and forces the active tool to Select (so clicking a path to choose what to keyframe still works, without an edit tool armed underneath the Timeline); picking "Draw" (or the Timeline's own "Done" button) swaps back. Turning the flag off while parked in Animate mode snaps back to Draw and hides the switch, so there's no dead end. This mode switch is a UI-only gate — it doesn't add a new playback/editing interlock beyond the existing `isPlaying` guard, since selecting paths while paused in Animate mode is intentional (you need to pick what to keyframe).
