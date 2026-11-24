# DRAGDIAG result — 2026-11-11

This is a **new-primary-drag + diagnostics build for real-machine verification, NOT a confirmed Windows fix**. The user's Windows image-drag ghost and failed DRAGFIX remain the real-machine evidence. Linux CDP input is synthetic and does not exercise Windows OLE/native hit-testing.

## Implementation

The pet's `main` has `-webkit-app-region: drag`. Its exposed background (top and side space around the image/bubble) is the primary OS window-move surface. Both `img` and `#bubble` explicitly have `no-drag`: image click still pats, image double-click requests chat, and image/bubble right-click requests the menu. The video remains pointer-transparent. Main's drag region can swallow renderer input; use the no-drag image or bubble for the application menu rather than depending on right-click delivery from native drag space.

The image's second-layer JS pointer capture/drag chain, absolute screen-coordinate totals, first-move window origin, finite-coordinate validation and rounded destination remain intact. `draggable="false"`, `-webkit-user-drag:none` and dragstart prevention are retained. Existing positioned elements are retained. Look-at-mouse still applies translate/rotate to the image independently of the region CSS and retains its interaction/menu blocking. The existing `pet.on('moved')` handler still reads actual window position, updates settings, and persists; snapshots use those settings. Native dragging does not require a renderer pointer stream. Native moved-event/persistence behavior must still be checked on Windows; it is not established by the Linux synthetic displacement test.

## Diagnostics and sampling

All samples use existing synchronous `bootLog` appends and redaction; no new log file. One main-process counter allows **at most 60 `[drag]` lines per process boot total**, across startup, renderer, and main. The log remains append-only across boots, so an existing boot.log can contain more than 60 such lines overall.

- Startup (included in the budget): all displays' IDs, bounds and scaleFactor, and the pet's initial bounds after size/restored-position adjustment.
- Renderer document capture listeners: pointerdown, pointerup, pointercancel, dragstart, contextmenu, dblclick, with target classified as img/bubble/main and screen coordinates. Capturing observes dragstart before its existing preventDefault.
- Renderer pointermove: only events numbered 20, 40, 60, etc., including hover; sequence number included. Renderer also stops sending after 60 samples of its own. A gesture after the shared budget is exhausted produces no further drag lines until restart.
- Main: every 20th valid applied move command, including absolute/relative mode and actual final `getPosition()` after `setPosition`; menu and chat-open command arrivals each get a line. Move counts span gestures within the boot.
- Only pet webContents may submit renderer diagnostic samples; event names/targets are allowlisted and numeric fields normalized. The preload exposes a separate send method so diagnostics do not await the existing invoke chain.

## Linux validation

`npm test`: **150/150 pass**, zero failures (4.53 seconds).

`npm run smoke`: **pass** for smoke-drag, smoke-m6, smoke-m5-1 (clean and corrupted-user-character), and smoke-m6p2. Existing smoke assertions were retained.

Extended smoke-drag asserts computed main=`drag`, img/bubble=`no-drag`; actual BrowserWindow displacement within 8px per axis in both directions; multiple setPosition applications; no native HTML dragstart or pointercancel; pat feedback; image and bubble contextmenu reaching the real main menu command path; and image dblclick opening a chat window. It reads only this boot's appended boot.log bytes and checks startup, renderer pointerdown/contextmenu/dblclick, main move/menu/chat-open lines. Flooding diagnostic samples then proves the shared cap is exactly 60 lines.

| Linux forced scale | Forward delta | Reverse delta | Error per axis | Applied moves per direction | Log cap |
|---|---|---|---|---|---|
| 100% | 300,100 | -300,-100 | 0,0 | 20 | 60 |
| 125% | 300,100 | -300,-100 | 0,0 | 20 | 60 |
| 150% | 300,100 | -300,-100 | 0,0 | 20 | 60 |

**Right-click/double-click test boundary:** Linux Electron 42/Xvfb CDP mouse input reached contextmenu on both no-drag islands and dblclick on the image under this actual CSS layout. The menu's popup method is stubbed in smoke after the command reaches main to avoid a modal native menu blocking subsequent injected input; menu rendering/selection is not verified. These checks establish synthetic event/command delivery only. Native drag-area right-click/double-click delivery, Linux OS window movement, Windows right-click behavior and Windows native primary dragging are not verified by this harness. No physical Windows input was available.

## Delivery and remaining real-machine checks

Rebuilt only repository-root `PetLink-M6-Win-诊断版.zip`, with build staging under repository `dist/m6-win`. The bundled 使用说明.txt includes “拖不动时”, instructions to try background dragging and image dragging separately, pat/chat/menu checks, and “拖完把 exe 旁 boot.log 发回” (user-data fallback if the executable directory is unwritable). No archive is copied outside the repository. The existing ignore rule excludes the binary archive from git; implementation, packaging script, smoke, and this report are committed.

Pending on the user's Windows machine: exposed-main native movement, image fallback drag/no image ghost, click/pat, double-click/chat, image/bubble menu and drag-space right-click behavior, look-at-mouse after release, moved/snapshot persistence across restart, real 125%/150% and mixed-monitor DPI, and useful boot.log return from a failing gesture. None is claimed fixed by Linux green results.

Archive: **278,041,709 bytes**. SHA-256: `30c8905dfa633537f81333c200d09b734af7ac13e5531e47016505878d2655e0`.

ZIP CRC validation passed for every entry. Packaged main.mjs, pet.html, pet.mjs, and preload.cjs match the working source byte-for-byte; the bundled diagnostic readme section was checked.
