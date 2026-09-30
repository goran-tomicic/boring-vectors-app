# Boring Vectors — Post-v1 Roadmap

_Last consolidated 2026-09-30. Covers the three features decided on after the v1 parity pass and new-project scope (`docs/SPEC.md` steps 1–7, all done — see `CLAUDE.md` Status): multiple projects, animation, and export. This file is a reference for the current state of that work and the decisions behind it — not a chronological changelog; `git log` is authoritative for history._

## Status: all three areas done

- **Projects** — multiple named, autosaved, switchable projects (rename of the original "documents" concept).
- **Export** — SVG (clipboard/download), raster PNG/JPG, portable project-file export/import.
- **Animation** — a keyframe timeline: opacity, position (X/Y), size (width/height), rotation, ratio-based scale, fill color, stroke color, and per-keyframe easing. Feature-flagged off by default (Settings → "Animation timeline (beta)") since it's still young; a "Loop timeline playback" setting is available alongside it.
- **Animated export** — every animatable property bakes into a standalone-playable SVG (SMIL `<animate>`), plus GIF and WebM video export.

## Architecture decisions (read before touching this code)

**Animation clip is a second source of truth, deliberately.** CLAUDE.md's key architectural rule says Paper.js's `Project` is the sole source of truth for path geometry — not duplicated into the store. Animation keyframe data doesn't fit that: it isn't live geometry, it's timeline data describing geometry *over time*, which Paper.js has no concept of. The amendment, now in CLAUDE.md: Paper.js remains authoritative for a path's *current, static* geometry when not animating; the store's `animation` slice (clips keyed by path id + property) is authoritative for *how that geometry changes over time*. Playback writes interpolated values onto live Paper.js objects each frame; it never reads them back as truth. This is why `src/animation.ts` exists as a standalone, Paper.js-free module (pure data + pure functions), and why `PaperCanvas.tsx`/`canvasEngine/animationPlayback.ts` are the only places that turn that data into live geometry.

**Path identity is `path.name`, not Paper.js's `.id`.** Paper's `.id` is a per-session auto-incrementing counter — it gets reassigned on every reload/re-import, so anything persisted by path id (keyframes included) would silently orphan itself on the next reload. Every path gets a UUID `.name` assigned at creation time (import, pen tool, shape tool — see `hitTest.ts`'s `ensurePathName`), which Paper.js round-trips through the SVG `id` attribute on export/import, so it survives reload. All path identity — selection, hit-testing, animation — is keyed by `.name`.

**Rotation and ratio-scale need a "rest geometry" snapshot; nothing else does.** Opacity, X/Y, width/height, and color are all stored and applied as *absolute* values, so evaluating a keyframe never depends on transient state. Rotation/scale can't work that way: Paper.js bakes transforms directly into a path's segment data rather than keeping a separate matrix, so "rotate to 45°" only means something relative to a fixed rest shape. `PathTrack.restSegments`/`restCenter` (in `animation.ts`) capture that rest shape once, the first time rotation or scale is keyframed for a path — captured from live Paper.js state via a mediated store request (`transformKeyframeRequest`), since only `PaperCanvas.tsx` can read that state. Playback resets to a fresh clone of the rest snapshot every frame, then reapplies scale/rotation around `restCenter` — never incrementally. **Known limitation**: the rest snapshot isn't pruned when a path's rotation/scale keyframes are all deleted (only when the whole path track is removed) — node-editing such a path afterward can get silently overwritten on the next playhead change. Accepted for now; narrow edit-after-animate workflow.

**Color is three synced numeric channels, not a dedicated type.** `fillColorR`/`G`/`B` and `strokeColorR`/`G`/`B` (0–255) reuse the same absolute-numeric keyframe machinery as everything else instead of a parallel color-keyframe shape. They're always keyed/moved/removed together from `Timeline.tsx`, so a path has all three of a trio or none.

**SMIL export takes two different strategies depending on the property.** Opacity and color map 1:1 onto a native `<animate attributeName="...">`, with the SVG renderer doing the actual interpolation — `buildSmilAnimate()`/`buildSmilColorAnimate()` in `animation.ts` just emit the keyframe list; nothing there performs interpolation. Position/size/rotation/scale don't have that direct a mapping (same reasons as the rest-geometry note above), so instead the exporter densely samples the path's geometry at 24fps across the animation's duration on an offscreen clone (reusing `applyGeometryAtTime`, the exact function live playback uses) and bakes the result into one `<animate attributeName="d" calcMode="linear">`. Easing is effectively "pre-baked" by the sampling itself.

**GIF/video reuse one frame-rendering pipeline**, itself built on the same `applyFullAnimationAtTime` playback function: `renderAnimationFrames(fps, scale)` in `canvasEngine/svgExport.ts` pre-renders the whole animation into an array of offscreen canvases. GIF encodes them via `gif.js` (a new dependency — browsers have no native GIF encoder) using a Web Worker. Video uses the browser's native `MediaRecorder` on a `canvas.captureStream()` — no new dependency — drawing each pre-rendered frame at a steady interval in real time, so recording takes about as long as the animation's own duration.

## Code layout

Animation/export logic is split the same way `tools.ts`/`hitTest.ts`/`overlay.ts` already split tool/hit-test/overlay logic out of `PaperCanvas.tsx` — factories that take `contentLayer`/`storeRef` once, wired together in `PaperCanvas.tsx`'s mount effect:

- `src/animation.ts` — pure data model and functions (no Paper.js, no React): `AnimationClip`/`PathTrack`/`Keyframe` types, `evaluateProperty` (interpolation), `withKeyframeSet`/`Removed`/`Moved` (immutable updates for Zustand), SMIL-building helpers.
- `src/canvasEngine/animationPlayback.ts` — `applyGeometryAtTime`/`applyFullAnimationAtTime`/`applyAnimationAtTime` (write keyframe values onto live or cloned Paper.js paths) and `createPlaybackController` (the rAF playback loop, including loop-vs-pause-at-end).
- `src/canvasEngine/svgExport.ts` — `createSvgExporter`: static SVG, animated SVG (SMIL), raster (PNG/JPG), GIF, video.
- `src/components/Timeline.tsx` — the UI: one stacked track row per animatable property, driven by a `PROPERTY_DEFS`/`COLOR_ROW_DEFS` table (adding a new *absolute-valued* property is a table entry + a write branch in `animationPlayback.ts`, not a UI rewrite), docked as an overlay inside `CanvasWrap.tsx` rather than a flex layout sibling (so opening it never resizes the canvas — see the Rulers-desync bug this fixed).

## Known gaps / not done

- **No auto-keying of *new* keyframes.** Direct manipulation while in Animate mode (dragging a shape, Properties panel position/color edits) now updates an *existing* keyframe at exactly the current playhead time if one is there (see "Direct manipulation now updates existing keyframes" below) — but if the property has no keyframe at that exact time, the edit still just mutates the live path with no connection to the keyframe system, and the next scrub silently overwrites it. Whether that should instead auto-create a new keyframe (After-Effects-style) or require an explicit action is still an open design question, not built.
- Easing can't be edited on an existing keyframe after the fact (delete + re-add only).
- Rest-geometry pruning (see the rotation/scale note above).
- GIF/video export always renders exactly one pass regardless of the "Loop timeline playback" setting — a looping GIF is a separate, unrequested feature.
- No automated test coverage (Vitest/Playwright) — deferred project-wide per `CLAUDE.md`; all verification this far has been manual smoke scripts per change, not checked into the repo.

## Fixed: Timeline fields/overlay went stale while scrubbing

Two compounding bugs, both found from a user report ("moving to a timeframe doesn't show updates to transformed objects") and confirmed by reproduction before fixing:

1. The playhead-change handler in `PaperCanvas.tsx` called `applyAnimationAtTime` (which correctly moves/rotates/recolors the live path) but never refreshed the selection overlay or `selectedPathProps` — the data Timeline's property rows and the Properties panel read from. The canvas was right; the panels were stale, only updating on selection changes. Fixed by splitting `redrawOverlay` into `refreshSelectionDisplay` (overlay redraw + `selectedPathProps` refresh, no side effects) and the autosave-scheduling wrapper around it, and calling the former on every playhead change too — without triggering autosave on every animation frame during playback.
2. Separately, `Timeline.tsx`'s per-property `valueOverrides`/`colorOverrides` (used to preview a value before clicking "Key") never got cleared after the keyframe was actually set, so a field stayed pinned to whatever was last typed regardless of scrubbing, masking even the corrected live value from fix (1). Fixed by clearing the relevant override once its keyframe is committed.

Verified precisely: keyed X at 355 (t=0) and 555 (t≈end), confirmed the field showed ~455 at the midpoint scrub and progressed smoothly (405→573) across five samples during actual playback — not just manual scrub clicks.

## Direct manipulation now updates existing keyframes

First half of the "no auto-keying" gap above: dragging a shape (or editing its position/fill/stroke via the Properties panel) while in Animate mode now updates a keyframe that already exists at exactly the current playhead time, instead of silently drifting from it until the next scrub wipes the edit out. Deliberately conservative — `withKeyframeValueUpdated()` (`animation.ts`) only updates the value of a keyframe already at that exact time (within the same 1ms epsilon `withKeyframeMoved`/`withKeyframeRemoved` use); it never creates one. `syncKeyframesAfterDirectEdit()` (`canvasEngine/animationPlayback.ts`) is the shared hook — called from the Select tool's drag-commit (`tools.ts`) and from `PaperCanvas.tsx`'s `applyPropsEdit` (position/stroke/fill edits) — and checks x/y and both color trios.

Verified: keyed X at t=0 (355), dragged the shape at that same time to ~476 — the existing keyframe updated (stayed at 1 keyframe, not 2), and the new value survived a scrub-away-and-back (confirming the stored keyframe changed, not just the live display). Confirmed the inverse too: dragging with no keyframe present at the current time creates none (0 keyframes before and after), matching the "update-only, never auto-create" scope.
