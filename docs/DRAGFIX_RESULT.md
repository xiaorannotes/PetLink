# Drag repair result — 2026-11-11

Windows real-machine confirmation is **pending**. These results reproduce and fix defects on Linux Electron 42 / Xvfb; they do not establish that the user's Windows machine is fixed.

## First run, before application changes

Created `scripts/smoke-drag.mjs` first and ran it against the unchanged application. CDP sends mousePressed, twenty mouseMoved steps, mouseReleased, then a reverse drag. Each target is 300px horizontally and 100px vertically. Main-process Node inspector reads the actual pet BrowserWindow.getPosition(), independently of renderer state. Viewport input compensates for measured window movement to describe a straight desktop pointer trajectory. No synthetic dispatchEvent drag is used.

The first two harness attempts failed before input (inspector evaluation does not support top-level await/dynamic import). After correcting the harness to use Node createRequire, the first actual drag baseline was **RED**:

| Direction | Start | End | Actual delta | Target | Error | Main setPosition calls |
|---|---|---|---|---|---|---|
| Forward | 400,300 | 415,305 | 15,5 | 300,100 | -285,-95 | 1 |
| Reverse | 415,305 | 400,300 | -15,-5 | -300,-100 | 285,95 | 1 |

Events across both drags: dragstart=2, pointermove=4, pointercancel=2, pointerup=0. This is an application failure, not a passing listener-registration check.

## Hypotheses tested in the requested order

1. **Native HTML image dragging: confirmed on Linux.** A controlled renderer-only override (`DRAG_DISABLE_NATIVE=1 node scripts/smoke-drag.mjs`) disables image dragging without changing IPC, capture, or coordinate arithmetic. Both drags then move exactly ±300,±100, with 20 main-process setPosition calls each; dragstart=0, pointermove=42, pointercancel=0, pointerup=2. Permanent fix: image `draggable="false"`, CSS `-webkit-user-drag:none`, and dragstart preventDefault.
2. **Invoke round-trip throttling: not implicated in this reproduction.** With only the native-drag override, all 20 move updates per drag reach main and apply, with zero final error. A subsequent `DRAG_STEP_MS=1` stress run also applies 20 updates each way with zero error. The existing handler does not await before setPosition and the renderer does not wait for each reply. This is not a Windows latency benchmark. Retained invoke; no speculative send channel or rAF coalescing change.
3. **Pointer capture fighting window movement: not reproduced at 100%.** Capture stays enabled throughout the controlled passing experiment. Screen-coordinate deltas and main window movement agree, without oscillation. No evidence supports removing capture.

## DPI investigation and second confirmed defect

After these tests, forced 125% scaling with only native-drag prevention exposed a separate measurable error: forward 400,300 → 680,380 (280,80), reverse → 360,260 (-320,-120). Each drag applies all 20 updates but accumulates -20px per axis. Traced DOM screen coordinates advance by exactly 15,5 each step; client coordinates drift as actual window positions lag. This isolates repeated relative native-window positioning/rounding at fractional scale, rather than missing events or physical-pixel DOM coordinates. The precise native rounding implementation is not asserted here.

The [CSSOM View specification](https://www.w3.org/TR/cssom-view-1/#css-pixels) defines these coordinates in CSS pixels. [Electron screen documentation](https://github.com/electron/electron/blob/main/docs/api/screen.md) distinguishes physical points from DIP and provides screenToDipPoint for physical inputs. Therefore blindly dividing DOM screenX by display.scaleFactor is unsupported by both this trace and the specification. Linux forced scaling is not Windows mixed-monitor DPI validation.

Implemented absolute totals: renderer retains pointerdown screen coordinates. Each `move` carries `{x: totalDx, y: totalDy, mode:'absolute', start: boolean}`. The first moved event (`start:true`) records BrowserWindow.getPosition() in main, before any movement. Later events position at that stored origin plus total displacement. Main validates sender and finite coordinates and rounds the final destination once. Legacy relative mode remains supported. The threshold only gates starting a drag; returning to the original pointer position after starting still updates the window. No scaleFactor division is applied.

## Final measurements and regression

| Forced scale | Forward delta | Reverse delta | Final origin | Error each direction | Main updates each direction |
|---|---|---|---|---|---|
| 100% | 300,100 | -300,-100 | 400,300 | 0,0 | 20 |
| 125% | 300,100 | -300,-100 | 400,300 | 0,0 | 20 |
| 150% | 300,100 | -300,-100 | 400,300 | 0,0 | 20 |

All three runs: no dragstart or pointercancel; two pointerups. Smoke asserts ≤8px per axis in both directions, return within 8px of original position, and multiple main updates during each drag. `npm run smoke` now runs drag first, then the unchanged smoke-m6, smoke-m5-1, smoke-m6p2 scripts. All existing assertions are retained.

- `npm test`: 150/150 pass.
- smoke-m6: pass (economy, animation, fallback, boot and interaction).
- smoke-m5-1: pass, both clean and corrupted-user-character scenarios.
- smoke-m6p2: pass (local mock request, shared history, typing, settings, diagnostic masking).
- An earlier m5-1 attempt failed its boot-log assertion during overlapping smoke runs sharing the executable's boot.log. The complete sequential sequence subsequently passes without changing that assertion.

Control window: code inspection confirms default native frame/title bar. Mini chat: frame:false with existing `-webkit-app-region:drag` header and no-drag buttons. These mechanisms are unchanged; native title-bar movement was not exercised through CDP and Windows confirmation remains pending.

`pet.on('moved')` persistence remains unchanged. Drag updates occur during movement, not deferred until release. Added `stage=pet-drag-channel ok` after pet creation: it reports registration of the existing authorized IPC path, not drag success on any machine. No new IPC send channel is claimed.

## Delivery and remaining checks

Rebuilt `PetLink-M6-Win-诊断版.zip` in the repository root only using `node scripts/package-win.mjs`. Build staging stays inside repo `dist/m6-win`; no archive copied outside the repository. Archive checksum and size are recorded below after completion. The archive is ignored by existing git rules; source and this report are committed.

Pending: user Windows drag in both directions, persistence across restart, 125%/150% real display scaling and mixed-DPI monitor transitions, native control/chat window dragging and Windows frame-by-frame responsiveness. The observed Linux root causes are confirmed; attribution of the user's Windows failure remains unconfirmed until that retest.

Archive: **278,040,845 bytes**. SHA-256: `360aed9e74d2d08883ef0194f0bcf07e76986616a26c4e8280d1fd46bacbb4f2`.
Packaged main.mjs, pet.mjs and pet.html were compared byte-for-byte with the final working files and match.

A later full test run while packaging was active recorded 149/150: the existing adapter nonresponsive-Hub wall-clock assertion took 888ms. No timeout assertion was changed; the full suite was rerun without the concurrent build/smoke load.

Final isolated full-suite rerun: **150/150 pass**, 0 failures (4.69s).
