# Codex 施工简报 M4：Electron 外壳 + 控制页 + 肖大大角色包（内测版）

项目：PetLink。必读：DEV_DOC 第 0 节（洁净红线）、第 5 节（桌宠表现层）、第 6 节（角色包规范）、第 7 节（控制页规格）、第 8 节（配置管理器/首次启动向导）、第 10 节（技术选型）、第 12 节验收口径。前置：M1–M3 已验收（113/113），本模块不许破坏既有测试。

## 红线

- 洁净重写：不得打开或参考 ~/workspace/ai-buddy-mac 的代码与界面；角色帧图是唯一例外——肖大大帧图为负责人自有生成素材，由阮小小在派工时单独给出素材文件夹路径，只许从该文件夹取图打包，不许顺带看旧 fork 的其他任何文件。
- 若派工时未附素材路径：先用程序生成的占位帧（纯色块+状态文字，透明底）跑通全管线，角色包 manifest 里标注 placeholder: true，并在 M4_RESULT 里明说，等真图到位后只换包不改代码。
- 用户可见文案简体中文；台词按 DEV_DOC 第 5 节：每状态 8–12 条，可爱简短，不用网络烂梗。

## 本模块交付物

1. `apps/desktop/`（Electron 应用，主进程 Node ESM，渲染层原生 Web 技术，不引重型框架）
   - 主进程内嵌启动 Hub（复用 packages/hub，不另起进程）；托盘图标+菜单（打开控制页 / 显示隐藏桌宠 / 退出）。
   - 桌宠窗口：无边框、透明、置顶、可拖拽、位置记忆；右键菜单（控制页 / 大小档位 / 置顶开关 / 退出）；左键点击触发摸摸互动（表情反馈，不打断当前状态展示）。
   - 帧播放器：按角色包 manifest 播放 WebP/PNG 帧序列，fps、循环/单次按 manifest；状态→动作映射按 DEV_DOC 第 5 节表（working 打字循环 / waiting 举牌+气泡「等你确认」 / done 跳跃单次+随机完成台词 / error 单次后转 idle 表情 / idle 发呆循环、5 分钟无事件转睡眠 / offline 趴下）。
   - 大小可调：控制页滑杆 50%–200%，实时生效并记忆（负责人明确要求）；不透明度可调。
   - 系统通知：接 packages/notifier 的 onNotify 回调，用 Electron Notification 实现；waiting 带轻提示音（可静音），安静时段行为沿用 notifier 既有规则，不在桌面层另设一套。

2. 控制页（单窗口四页，按 DEV_DOC 第 7 节）
   - 连接页：Claude Code / Codex / 通用接入三张来源卡片——是否检测到该工具、适配器开关（调 packages/config-manager 的 enable/disable/status）、当前状态、最近事件时间、「测试一下」按钮（发模拟事件验全链路）。
   - 宠物页：角色切换、本地角色包导入（按第 6 节校验 manifest，失败给出具体缺项）、大小滑杆、不透明度、提示音开关、安静时段设置（默认 22:30–07:00）。
   - 通知页：系统通知开关（按状态勾选）、外发 Webhook 配置（URL+自定义头，默认关）、测试发送按钮。
   - 诊断页：最近 100 条事件日志（读 Hub 环形日志）、Hub 端口/令牌（令牌只显示前后 4 位）、一键清空日志、导出诊断包（不含令牌全文）。

3. 首次启动向导（DEV_DOC 第 8 节）
   - 检测 ~/.claude、~/.codex 是否存在 → 逐个征得同意后才调 config-manager 写入；每个工具的写入结果逐项打勾展示，失败给人话原因；可跳过，之后在连接页也能开。

4. `characters/xiaodada/`（肖大大角色包，内测版）
   - 按第 6 节规范：manifest.json（id/name/author/version/license/anchor/scale/states/lines）+ frames/<state>/<动作名>/frame_000.webp…；五态动作齐全（素材缺哪态先用占位帧并在 RESULT 里列明）。
   - 验收素材自查：在透明底、深色、浅色三种背景下各出一张合成预览图存 docs/m4-previews/，不许只在白底看。

5. `scripts/demo-desktop.mjs` 或等价的无头自检脚本
   - 校验角色包 manifest 与帧文件完整性、状态映射表与 manifest 一致、控制页四页的静态资源齐全；Electron 本体在沙箱跑不了就如实记录，留阮小小在本机/真机复验（截图验收按 DEV_DOC 第 12 节第 4 条，由阮小小复验时完成，不在本模块自称通过）。

6. 根 `npm test` 保持 113 全过；新增的纯逻辑部分（manifest 校验、状态映射）要有单测并计入总数。

## 不做

打包安装器（electron-builder 配置留到 M5 打包模块，本模块只保证 `npm run` 能起开发模式）、Cursor 适配器、角色包导入的商店/付费、自动更新、双机真机验收（负责人侧配合，另行安排）。

## 交付说明

docs/M4_RESULT.md：文件清单、测试结果（含沙箱受限项如实标注）、三背景预览图路径、角色包缺帧清单（如有）、规格不一致回报。

## 派工补充（阮小小，2026-11-10 派工时定）

1. **素材路径已备好**：肖大大素材在 `~/workspace/petlink-m4-assets/xiaodada/`（poses/ 13 张单张姿势 PNG；clips/ 20 张 WebP 精灵图页：idle/wave/pet/typing/drag 各 4 页；规格见该目录 README：每组 120 帧、24fps、单帧 256×280、每页 6×6=36 帧）。只许从此文件夹取图，不许访问 ~/workspace/ai-buddy-mac 的任何其他内容。
2. **精灵图处理方式已定**：clips 是精灵图页、不是逐帧文件。角色包构建步骤负责把精灵图按格切成 `frames/<state>/<动作名>/frame_000.webp…` 逐帧文件，运行时播放器只认逐帧格式（按 DEV_DOC 第 6 节角色包规范），不要让播放器支持精灵图寻址。
3. **状态→动作映射**：working→typing（循环）；done→wave（单次）；idle→idle（循环，5 分钟无事件转睡眠沿用简报口径，可用 idle 帧降速/静止近似并在 RESULT 注明）；摸摸互动→pet（单次）；拖拽中→drag。**waiting / error / offline 三态没有专属动作素材**：按简报红线用程序生成的占位帧跑通（manifest 标 placeholder），并在 M4_RESULT 里明确列出这三态待补素材。
