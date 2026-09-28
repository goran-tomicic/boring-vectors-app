# Boring Vectors

An SVG editor _and_ maker for the web — import and edit existing paths down to the bezier node, or draw new ones from scratch. This repo starts empty: build it from scratch as a React + TypeScript app, using this file and `docs/SPEC.md` as the brief. Full spec, feature inventory and architecture rationale live in `docs/SPEC.md` — read it before making structural decisions.

## Stack (decided)

- Vite + React 18 + TypeScript
- Paper.js for the vector scene graph / canvas rendering — kept from the original prototype (decided; see `docs/SPEC.md` § Proposed Architecture — a hand-rolled SVG-DOM alternative was considered and deferred)
- Zustand for UI state
- Plain CSS with variables, ported 1:1 from the prototype's dark theme — no Tailwind, no CSS-in-JS

## Key architectural rule

Paper.js's `Project` is the source of truth for path geometry (segments, handles, colors) — do **not** duplicate it into the Zustand store. The store only tracks UI-level state (active tool, selected path/segment id, canvas size, settings). Only the component that owns the `<canvas>` should touch the Paper.js `Project`/`Path` API directly; everything else reads or writes through the store or derived view-model props passed down.

## Build order

Follow `docs/SPEC.md` § Build Plan in order — don't jump ahead to later-step features while parity steps are unfinished:

1. **Scaffold** — Vite + React + TS, CSS tokens, static layout shell (TopBar, CanvasWrap, PropsPanel, InfoBar), no drawing logic yet
2. **Canvas bridge** — mount Paper.js on the canvas, port background/grid/fit-to-view
3. **Tools parity** — Select, Node, Add Point, matching `docs/SPEC.md` § Feature Inventory exactly
4. **Properties panel** — wire position/node/stroke/fill inputs
5. **Import/export** — paste-SVG modal, clipboard export, plus save/load persistence (v1 scope — decided)
6. **Parity pass** — walk the Feature Inventory table as a checklist against the build
7. **New-project scope** — undo/redo, multi-select, named documents, an on-canvas ruler/measurement tool, numeric handle-position inputs, and **maker tools** — a pen tool to draw new paths from scratch plus basic shape primitives (rectangle, ellipse) — so the app isn't import-only

## Conventions

- One component = one `.tsx` + one co-located `.css` file (no CSS modules, no inline styles except runtime-computed values)
- During the parity pass (steps 1–6), match the original prototype's interaction behavior exactly — tool names and keyboard shortcuts are load-bearing, not placeholders; check `docs/SPEC.md` § Feature Inventory and § Keyboard Shortcuts before changing any of them
- Don't build step-7 features ahead of the parity pass unless asked

## Direction reference

[svgstudio.org](https://www.svgstudio.org/) — a browser-based SVG _animation_ editor with layers, a keyframe timeline, grouping (⌘G), 100-step undo, and direct-manipulation handles — was the product-polish bar to aim for eventually, kept out of scope until the parity pass finished. The parity pass and new-project scope are done (see Status), and a keyframe-timeline animation feature is now explicitly in scope — see `docs/ROADMAP.md`, which supersedes this section's earlier "don't add animation" guidance.

## Post-v1 roadmap

Work beyond the original 7-step build plan (multiple projects, export, animation) is tracked in `docs/ROADMAP.md`, not here — read it before touching projects/export/animation code. It also documents a pending amendment to the "Key architectural rule" above: animation keyframe data needs a new store slice as a second, explicit source of truth (timeline data, not live geometry), separate from Paper.js's `Project`. Apply that amendment when the animation step (step 3 of the roadmap) begins.

## Status

All 7 build-order steps are done, including step 7's new-project scope (undo/redo, multi-select, named documents, ruler tool, numeric handle inputs, maker tools — pen + rectangle/ellipse). One deviation from the order above: Import was pulled forward to run right after Tools parity (step 3) instead of after Properties panel, since Properties panel needed real paths on canvas to test by hand — see the plan file for the reasoning. `docs/SPEC.md`'s Build Plan numbering doesn't reflect this reorder; treat this Status section as authoritative over that list for what's actually done.

Post-v1 work (multiple projects, export, animation) is now underway per `docs/ROADMAP.md` — see that file's own Status section for progress.

Automated test scaffolding (Vitest/Playwright) has not been set up — deferred by user request. All verification so far has been manual (dev server + one-off headless-browser scripts per change, not checked into the repo).
