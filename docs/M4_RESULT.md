# M4 交付记录

本次施工完整阅读 `DEV_DOC.md` 与 `CODEX_BRIEF_M4.md`（含 2026-11-10 派工补充）。实现已提交准备复验；当前受沙箱限制，**不能声明全部测试通过或 Electron 实机验收通过**。

## 实现与文件清单

- `apps/desktop/main.mjs`：Node ESM 主进程内启动既有 Hub；托盘、控制窗口、透明桌宠窗口、置顶/显示隐藏、右键菜单、位置与大小/透明度持久化；受限 IPC、隔离 preload、禁止新窗口与导航。
- `apps/desktop/preload.cjs`：仅暴露命令调用和快照订阅，不暴露 Node/Electron 给页面。
- `apps/desktop/control.html`、`control.css`、`control.mjs`：原生 Web 四页（连接、宠物、通知、诊断），无 UI 框架。来源状态、检测、配置开关、测试事件、多会话明细；角色切换/本地导入；50%–200% 大小与不透明度；提示音/安静时段；系统通知状态勾选、默认关闭的 Webhook、自定义头、测试；100 条日志、掩码令牌、清空与无令牌诊断导出。
- 首次向导逐项展示 Claude Code / Codex 检测与同意按钮，未点击不写配置，可跳过。写入复用 M2/M3 备份和安全合并逻辑；错误就地展示并提供控制页内手动接入指引。
- `apps/desktop/pet.html`、`pet.mjs`、`character.mjs`：逐帧播放器，按 fps、循环/单次播放；摸摸、拖拽、安静降亮、5 分钟闲置睡眠；校验包字段、包内帧路径及真实文件（阻止帧软链接越界）。导入包六态必需，互动/睡眠动作可选并回退 idle，台词可选并回退中文台词。
- `apps/desktop/character.test.mjs`：新增 6 项纯逻辑测试。
- `characters/xiaodada/manifest.json` 及 `frames/`：肖大大内测角色包，600 张真实逐帧图 + 3 张占位帧；每状态 8 条简体中文台词；授权说明为负责人自有生成素材、仅供内测。
- `scripts/build-xiaodada.py`：构建时从唯一授权目录读取五组四页精灵图，按每页 6×6、单格 256×280 切出每组 120 帧，24fps。运行时没有精灵图寻址逻辑。
- `scripts/demo-desktop.mjs`：校验 manifest、帧文件、状态映射、四页静态资源与三背景预览。
- 根 `package.json`：新增 desktop workspace、Electron 开发依赖和命令；既有 packages 源码与测试未修改。安装受限，未生成锁文件。

## 动作与缺素材说明

| 状态/互动 | 动作 | 说明 |
| --- | --- | --- |
| working | typing | 120 帧循环 |
| done | wave | 120 帧单次，末帧停留至 Hub done 窗口结束 |
| idle | idle | 120 帧循环 |
| 摸摸 | pet | 120 帧单次，覆盖 5 秒后恢复当前聚合态 |
| 拖拽 | drag | 单次，拖动期间末帧停留，松手恢复 |
| waiting | placeholder | 缺专属素材，透明底色块与「等你确认」文字 |
| error | placeholder | 缺专属素材，单次后 idle 表情，错误气泡保留 |
| offline | placeholder | 缺专属素材，透明底色块与离线文字 |
| sleep | idle 首帧 | 5 分钟无新事件后静止近似睡眠，无新增睡眠素材 |

manifest 顶层 `placeholder: true`，waiting/error/offline 动作也各自标记 `placeholder: true`。待补的专属动作只有这三态。sleep 复用 idle，不是新增素材。

## 验证过程与结果

1. `python3 scripts/build-xiaodada.py` 成功，输出 603 个独立帧文件和三张合成预览。依赖 Python 3、Pillow、Noto CJK 字体（构建脚本内指定字体路径）；运行 App 不依赖 Python。
2. `npm run demo:desktop` 成功：603 个独立帧文件、9 个映射、四页资源、三背景预览齐全。
3. 主进程、preload、控制页和播放器均通过 `node --check`；`git diff --check` 通过。
4. 按要求运行根 `npm test`，退出 1。当前沙箱的 Node 测试进程隔离只输出文件级失败：10 个文件、5 通过、5 失败。未调整测试来掩盖失败。
5. 为定位原因，运行 `node --test --test-isolation=none packages/*/*.test.mjs apps/desktop/*.test.mjs`，实际展开 **119 项，106 通过、13 失败**；新增 M4 **6/6 通过**。失败为监听回环端口被拒绝 `listen EPERM 127.0.0.1` 及执行子进程被拒绝 `spawnSync /usr/bin/node EPERM`；另两项子进程输出为空导致 JSON/输出断言失败。
6. 用 `git archive HEAD` 将施工前基线解到 `/tmp/petlink-m4-baseline`，相同沙箱下以相同无隔离参数运行：原有 **113 项，100 通过、13 失败**。失败测试名称与当前一致，新增模块未增加基线失败。正常权限环境仍需重跑 `npm test`，目标为 119/119。
7. `npm install --cache /tmp/petlink-npm-cache --fetch-retries=0 --fetch-timeout=15000` 失败：请求 npm registry 的 Electron 包被系统 `EPERM` 拒绝。`npm run desktop` 已尝试，结果 `electron: not found`。虽有 Xvfb，本次缺 Electron 且不能联网安装，无法启动桌面或运行浏览器端验收。当前权限策略不允许提权，未绕过沙箱。
8. 测试证据保存在 `docs/m4-test-results.txt`（基线/当前的逐项结果与错误）。

## 三背景预览

- `docs/m4-previews/transparent.png`
- `docs/m4-previews/dark.png`
- `docs/m4-previews/light.png`

这三张是角色帧的合成素材预览，并非 Electron 实机截图。已检查透明背景及明暗背景的角色轮廓与占位动作。五态真实运行深浅背景截图、Windows/macOS 全链路仍由阮小小真机复验；本次不声明通过。

## 本机复验步骤与已知边界

在允许 npm 下载与监听回环的开发机执行 `npm install`、`npm test`、`npm run demo:desktop`、`npm run desktop`。向导可先跳过；连接页测试发真实模拟事件。核对 waiting/working 多会话聚合、done 8 秒、摸摸与拖动后回到当前状态、滑杆和重启持久化。通知遵循既有 notifier 的安静时段及 60 秒会话去重；测试按钮也不绕过规则，waiting 优先态可能遮住 done 测试。Webhook 默认关闭，启用后才会外发。

- 系统通知点击打开控制页，聚焦来源工具未做跨平台窗口查找（尽力聚焦的降级行为）。
- 适配器写入使用 `node` 命令，需要目标机 PATH 可找到 Node；避免将 Electron 可执行文件当作 Node 写入配置。真机需检查 hook 环境 PATH。
- macOS 多 Space 使用 Electron `setVisibleOnAllWorkspaces`，置顶使用 floating 层级；刘海屏、多显示器缩放、系统通知/音量和拖拽仍待真机检查。位置恢复会钳制到可用显示器范围。
- 按 M4 明确边界，不实现安装器、Cursor、自动更新、双机验收；等待素材三态仍为占位。其余未静默变更协议或配置管理器规格。

## 洁净自查签注

Codex：施工期间未打开、读取或参考禁止的旧仓库代码与界面。图像输入仅来自 `~/workspace/petlink-m4-assets/xiaodada/clips/`；额外色块由程序原创绘制。新增源码、角色包和构建脚本未发现旧项目代码/名称引用。仓库文档原本包含洁净红线中的项目名称，不作为实现引用。本次未使用百炼个人记忆或上传任何资料。

## 提交限制与恢复

直接 `git add` / `git commit` 被 `.git` 只读挂载拒绝：`Unable to create .git/index.lock: Read-only file system`。为保留可审阅提交，复制 Git 元数据到 `/tmp/petlink-m4-git`，以当前工作区为 work-tree、沿用仓库已配置的 XiaoRan 身份创建提交；bundle 位于 `/tmp/petlink-m4.bundle`。原仓库分支尚未更新。解除只读后可用 `git fetch /tmp/petlink-m4.bundle HEAD`，核对提交后 `git merge --ff-only FETCH_HEAD`（需先妥善保存/清理当前同内容工作区，避免未跟踪文件冲突）；也可直接对本工作区正常 add/commit。此限制不等于已在原仓库成功提交。
