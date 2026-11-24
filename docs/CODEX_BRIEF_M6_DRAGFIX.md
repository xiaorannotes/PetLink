# 拖动修复简报：桌宠在 Windows 实机拖不动（用户 2026-11-11 三次反馈，M5 首跑即有）

## 病情与已排除项
用户在自己 Windows 电脑上，从 M5 到 M6 二期包，桌宠**始终拖不动**。主控已逐行核查现行代码：
- pet.mjs：pointerdown/move/up 监听在模块顶层无条件注册（不在任何 await 之后）；pointermove 里 `window.petlink.call('move',{x,y})` 按增量发送；阈值 |x|+|y|>2 后置 drag.moved。
- main.mjs：`move` 命令校验 sender=pet.webContents 后 `pet.setPosition(x+round(arg.x), y+round(arg.y))`，链路表面完整。
- pet.html：img 有 `touch-action:none`、无 `-webkit-user-drag` 相关设置。
- **现有全部测试与三套冒烟没有任何一处模拟过 pointer 事件并断言窗口位置变化**——这条链从未被验证过，「监听已注册」不等于「拖得动」。本轮第一性原理：先在本机 Linux 冒烟里把真实拖动跑出来，红了定位，绿了再谈 Windows 差异。

## 主控的三个怀疑点（按序验证，不许跳步）
1. **img 原生 HTML5 拖拽抢事件（头号）**：Electron/Chromium 中 `<img>` 默认 draggable，pointerdown 后浏览器可能进入原生图片拖拽（dragstart），pointermove 不再按预期流向页面，Windows 上尤其常见。冒烟里监听 dragstart 是否触发、并实测修复：img 加 `draggable="false"` 与 CSS `-webkit-user-drag: none`，dragstart 时 preventDefault。
2. **IPC 往返节流**：pointermove 高频触发 invoke('move')，每个 invoke 是异步往返；若 Windows 上 invoke 排队/延迟高于事件频率，增量虽最终到达但窗口跟不上、体感「不动」，或异常时 promise 未 catch 堆积。修法：拖动期改为单向 `ipcRenderer.send` 通道（preload 新增 `send` 白名单方法，主进程 ipcMain.on('desktop-move') 直接 setPosition），不再走 invoke；同时 pet 页本地做一帧合并（rAF 内只发最新增量）。判定标准不靠猜：冒烟里统计一次 300px 拖动中主进程实际收到的 move 次数与最终位移。
3. **setPointerCapture 与主进程移窗打架**：页面捕获指针后，主进程 setPosition 移动窗口，screenX 基准随窗口移动而变——若增量计算被抵消，窗口可能原地抖动不动。冒烟用 CDP 真实鼠标事件复现并测最终窗口位置；若确证，改为 pointerdown 时记录起点、每帧用「当前 screen 坐标 − 起点 screen 坐标」算总位移、主进程按「按下时窗口位置 + 总位移」绝对定位（main 侧 move 命令加 mode:'absolute' 或新命令 drag-to {startWinX,startWinY,dx,dy}，实现自选，协议写进 RESULT）。

说明：三个怀疑点是待验假设，不是结论；哪个成立、证据是什么，必须写进 RESULT。若三个都不成立而冒烟拖动本来就通，则把冒烟的拖动断言做成常驻回归，并深入查 Windows 特有路径（frameless 窗口在 Windows 上的 pointer 事件差异、DPI 缩放下 screenX/screenY 与 setPosition 坐标系不一致——用户机器若开了 125%/150% 缩放，screen 坐标为物理像素而 setPosition 用 DIP，正是「拖了但位移不对/像没动」的经典成因；若走这条线，增量须按 scaleFactor 换算，写清换算来源）。

## 必做交付（缺一不可）
1. **冒烟新增真实拖动验证**（新脚本 smoke-drag.mjs 并接入既有冒烟序列）：CDP Input.dispatchMouseEvent 在 pet 窗口内做 mousePressed → 多步 mouseMoved（总位移 ≥200px）→ mouseReleased，断言 `pet.getPosition()` 实际变化量与目标位移误差 ≤8px；再做一次反方向拖动断言回到近原点。修复前先跑一遍记录红/绿基线（写进 RESULT）。
2. 按定位结果修根因；不许用「加大阈值/换个监听名」式碰运气改法。既有 150 项测试与 smoke-m6/m5-1/m6p2 全绿、断言不减。
3. **拖动手感**：拖动中窗口实时跟随（每帧更新），松手后位置持久化（既有 pet.on('moved') 逻辑保留）。
4. 顺带把控制窗与聊天小窗确认可拖（控制窗靠系统标题栏、聊天窗靠标题区既有实现，只需在 RESULT 里声明核查结论，不许顺手改坏）。
5. boot.log 增加一行拖动自检记录：pet 窗创建后主进程记 `stage=pet-drag-channel ok`（仅表示通道注册，不冒充实机结论），方便用户下次回传日志对账。
6. 新包覆盖仓库根目录 `PetLink-M6-Win-诊断版.zip`，RESULT 写 sha256/大小，不往仓库外拷。

## 交付文档
提交 + docs/DRAGFIX_RESULT.md：基线冒烟结果（修复前红/绿与数据）、根因与证据（哪条成立、怎么测出来的）、改动清单、新冒烟数据（位移误差实测值）、回归结果、未验证项（Windows 实机最终确认仍待用户复测——照实写，不许把 Linux 冒烟绿写成已修复 Windows）。
