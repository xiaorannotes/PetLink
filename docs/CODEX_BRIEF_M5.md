# M5 简报：启动结构改造 + Windows 诊断包

## 背景（必读）
M4 的 Win10 免安装包在用户电脑上双击后无窗口、无托盘、无报错。后续证据修正了定性：包内 exe 名仍是 electron.exe（任务管理器不显示 PetLink），且用户覆盖更新时被 Windows 提示「旧应用在使用中」——领先假设是**进程活着，但挂在建窗口之前的某一步上**（启动链中任一 await 永久等待即无声挂起，文件被锁）。本模块的目标不是修某个已确诊的 bug（死因未定性），而是把启动改造成**永不无声**：窗口先行、每步留痕、卡住也可见，并产出可在用户自己 Windows 电脑上一次定性的诊断包。

现状代码事实（apps/desktop/main.mjs，已核对）：
- 第 33 行 `if(!app.requestSingleInstanceLock())app.quit();else { ... }`，整个启动在 else 块顶层 await 直执行。
- 顺序：whenReady → mkdir(dataDir) → 读 desktop.json → `characters.push(await loadCharacter(root/characters/xiaodada))`（**无 try/catch**，逐帧 realpath 校验）→ 用户角色（有 try/catch）→ `hub=await startHub({dataDir})` → resetNotifier() → 建 pet 窗 → 定位 → tray → `if(!settings.onboarded)showControl()`（控制页排在最后）。
- control.html 是静态页，依赖 preload 的 snapshot IPC 渲染数据；snapshot() 依赖 hub 已启动。

## 任务 A：改造 apps/desktop/main.mjs 启动结构

1. **日志先行**：文件顶部（import electron 之后、任何其他逻辑之前）同步写 boot.log：
   - 路径：优先 exe 同目录（`path.dirname(process.execPath)/boot.log`）；不可写时回退 `app.getPath('userData')/boot.log`，并在能写的那份里注明实际路径。两个位置都写不了也不能崩。
   - 同步 appendFileSync，每条带时间戳。第一条必须是 `[boot] entry`（含时间、平台、版本）。
   - 注册 uncaughtException / unhandledRejection 处理器：写日志 + 尽量弹窗（dialog.showErrorBox），**不得**让异常静默杀死进程（记完日志后不要 rethrow 成无声退出；无法恢复时也要先落日志再退出）。
2. **窗口先行**：`app.whenReady()` 之后第一件事就是打开控制页窗口（在 mkdir/loadCharacter/startHub 之前）。注意 BrowserWindow 创建只能在 ready 之后，别提前。
   - 新增一个极简的启动页 `apps/desktop/boot.html`（内联样式、无外部依赖、不依赖 snapshot）：列出阶段清单（准备数据目录 / 加载角色 / 启动服务 / 打开桌宠），每阶段三态：进行中 / 成功 / 失败（含错误信息原文）。
   - 主进程通过 webContents.send 推送阶段进度；阶段失败时把错误堆栈写进页面 + boot.log，窗口保持打开不退出。
   - 全部阶段成功后，控制窗口再 loadFile 切换到现有 control.html，继续现有流程（pet 窗、tray、未 onboard 时停留在控制页——现有 `if(!settings.onboarded)showControl()` 逻辑保留语义，已打开的窗口不要重复建）。
   - snapshot IPC 在 hub 未就绪时不得抛错拖死页面：hub 未就绪时返回带 `booting:true` 的占位结构，control.html 现有渲染要能吃下（必要时对 control.mjs 做最小兼容，不得改版式与功能）。
3. **每步兜底 + 超时**：启动链每一步（mkdir、读设置、loadCharacter 内置角色、用户角色扫描、startHub、resetNotifier、建 pet 窗、tray）各自 try/catch：
   - loadCharacter 内置角色失败不得拖死主进程：记录失败、控制页标红该阶段，桌宠阶段跳过，其余继续。
   - loadCharacter 与 startHub 各加 20 秒超时（Promise.race）：超时按失败处理，日志写明 `timeout after 20s` 并注明卡在哪一步——这是定性「挂死」的关键证据。
   - 单实例锁抢不到时：boot.log 写明 `single-instance lock failed: another instance may be running`，并 dialog 提示「PetLink 可能已在运行（或旧进程未退出），请在任务管理器结束 PetLink.exe 后重试」，然后退出。不得无声 quit。
4. **不改的东西**：五态协议、Hub、适配器、通知、设置字段与校验、IPC 命令语义、control/pet 页面功能与版式——全部不动。只动启动编排、日志、超时、占位 snapshot 与新增 boot.html。
5. **测试**：现有测试必须仍全过（`node --test packages/*/*.test.mjs apps/desktop/*.test.mjs`）；为新的阶段编排/超时/占位 snapshot 逻辑补单元测试（能抽成纯函数就抽，如 stage runner）。Linux 无头环境如能跑 Electron 冒烟（xvfb）可做加分项，跑不了就在 RESULT 里如实写明，不要谎报。

## 任务 B：Windows 诊断包构建脚本 scripts/package-win.mjs

一条命令产出诊断包（在本 VM 的 Linux 上交叉组装，只做文件组装、不运行）：
1. 自动下载 Electron 42 win32-x64 官方 zip（https://github.com/electron/electron/releases/download/v42.0.0/electron-v42.0.0-win32-x64.zip ）到 ~/.cache/electron-petlink/ 缓存，解压。
2. 把解压出的 `electron.exe` **复制并改名为 `PetLink.exe`**（同目录其余运行时文件原样保留）。
3. 组装 `resources/app/`：仓库根 package.json（main 指向 apps/desktop/main.mjs）、apps/、packages/、characters/、**根级 node_modules 只放 ws**（源码 grep 已证：运行时第三方依赖只有 ws，被 packages/hub 引用；electron 是 devDependency 不进包）。若 npm install 拿不到 ws，用缓存/离线方式解决并在 RESULT 写明办法。
4. 写一份简短的包内 `使用说明.txt`：双击 PetLink.exe；若没反应，看同目录 boot.log 并把 boot.log 发回；任务管理器「详细信息」里按 PetLink.exe 找进程；更新时先结束该进程再覆盖。
5. 打成 zip：`PetLink-M5-Win-诊断版.zip`（顶层文件夹名 PetLink-M5-Win/），输出到仓库根目录，并在 RESULT 里写明 zip 大小与文件清单摘要。

## 交付物
- 代码提交到本仓库（git commit，信息写明 M5 内容）。
- docs/M5_RESULT.md：改了什么、测试结果原文摘要、zip 路径与大小、boot.log 预期阶段行样例、未验证项如实列出（重点：Windows 实机未验）。

## 红线
- 不要动 DEV_DOC 的协议与模块边界；不要顺手重构无关代码。
- 不要把「构建成功/测试通过」写成「Windows 可用」——实机验收在用户电脑上以 boot.log 为准。
- 网络受限下不动 Electron 大版本（锁死 42.0.0）。
