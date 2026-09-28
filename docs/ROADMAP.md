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

Step 4 (animated export — CSS/SMIL, then GIF/video) not started.
