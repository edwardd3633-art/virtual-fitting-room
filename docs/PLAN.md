# Gap analysis, phased plan and open technical questions

Baseline: PRD v1.0 (2026-10-14). No starter repository existed. This project was created from scratch to cover the Milestone 1 P0 scope.

## Requirements → code status

Legend: ✅ done · 🟡 partial or prototype · ⬜ not started

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-001 | Accounts / sign-in | ⬜ | Deferred: storage is local-only, behind the `ProfileStore` interface |
| FR-002–006 | Save / edit / reset / delete avatar | ✅ | Local storage; schema-versioned |
| FR-007 | Multiple named avatars | 🟡 | Store supports it; UI shows one |
| FR-010–015 | Avatar editor, units, views, validation | ✅ | Mannequin is a prototype (see FR-016) |
| FR-016–017 | Licensed, calibrated morphable model | ⬜ | Needs a proof of concept (U1) |
| FR-020–023 | Demo catalog, metadata, availability, exact asset resolution | ✅ | |
| FR-024–026 | Retailer feed, launch contract, browser extension | 🟡 | URL launch contract drafted; no feeds |
| FR-030–034 | Asset records, status, provenance, material flags | 🟡 | Data model and checks only; no admin UI |
| FR-035–037 | Format pipeline, mesh QA, batch import | ⬜ | Milestone 2 |
| FR-040–042 | Size switch, labels, static view | ✅ | |
| FR-043 | Side-by-side size comparison | ✅ | Two identical avatars in one scene; `?compare=` in the URL |
| FR-044–046 | Fit indicators, confidence labels, recommendations | 🟡 | Validation-level badge done; measurement table labelled as demo data |
| FR-050 | Approved geometry on avatar | ✅ | Solid colour; no textures yet |
| FR-051–056 | Poses, precomputed motion, dynamic cloth | 🟡 | `FittingEngine` abstraction only |
| FR-060 | Launch from own catalog | ✅ | |
| FR-061–065 | Embed API, retailer handoff | ⬜ | |
| AC-1–12 | MVP acceptance criteria | ✅ | AC-4 is met with local persistence; AC-11 by unit tests; AC-1–9 by the browser smoke test |

## Next tasks (small and testable)

**Milestone 1 follow-ups**

1. ~~Side-by-side size comparison (FR-043)~~ done. Also done: saved looks, data export/delete-all, GitHub Pages deployment.
2. Show a list of saved avatars and allow naming them (FR-007).
3. Add an accessibility pass: screen-reader check of the try-on page and a 3D-free summary view.
4. ~~Git and CI~~ done: the Pages workflow runs typecheck and unit tests on every push. Still to add: the browser smoke test in CI.

**Milestone 2: garment asset workflow**

5. Persist the `Catalog` in Postgres. The tables mirror the types in `domain/catalog.ts`; add revision history.
6. Build an admin console: create an asset record, upload a GLB to object storage, and move it through draft → processing → quality review → approved.
7. Add an automated GLB check: units/scale bounding-box sanity, manifold/normal checks, size label ↔ file mapping, and required metadata.
8. Write up the asset preparation pipeline (source tool → canonical file → web GLB) after PoC U3.

**Milestone 3: movement and drape PoC (gated on U1–U2)**

9. Choose one garment, one calibrated avatar and three poses. Implement `PrecomputedAnimationEngine` with baked vertex animation, then compare it with a runtime solver.
10. Measure frame rate and memory on target devices, and validate against the physical sample.

## Unknowns that need a proof of concept

| # | Question | Why it matters | Suggested spike |
|---|---|---|---|
| U1 | Which morphable body model can be commercially licensed and calibrated to six measurements? | SMPL/SMPL-X are non-commercial by default (a commercial licence is separate). MakeHuman/MPFB assets are CC0 but need calibration work. A commercial avatar SDK is the third option. | Fit each candidate to ~20 diverse measurement sets; report circumference error per landmark. |
| U2 | Runtime cloth in the browser: feasible, and at what quality? | Drives whether dynamic simulation is possible on mobile. | Compare a WASM/WebGPU position-based solver with baked caches on one garment; target mid-range Android and iPhone. |
| U3 | Do CLO/Browzwear/Style3D exports convert cleanly to per-size GLB, and which animation cache format should be used? | Defines the digitisation pipeline and cost per size. | Export one graded garment in 3 sizes and measure fidelity and file size after compression. |
| U4 | What can a pilot retailer actually provide? | Patterns and graded specs reduce cost; photos alone are weak. | Draft a data request sheet aligned to PRD §6. |
| U5 | Which auth/storage provider fits privacy needs for body data? | Body measurements are sensitive personal data. | Review data residency, encryption at rest, RLS, and deletion/export guarantees. |
| U6 | Calibration protocol for any fit indicator | Needed before FR-044/046 can show anything predictive. | Define physical try-on panel, tolerances, and success metric. |
