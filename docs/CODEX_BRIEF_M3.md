# Codex 施工简报 M3：Codex 适配器 + 通用 CLI + 通知器

项目：PetLink。必读：DEV_DOC 第 0 节（洁净红线）、4.2（Codex 适配器）、4.4（通用接入）、第 9 节（通知规格）、12 节验收口径。前置：M1/M2 已验收（94/94），本模块不许破坏既有测试。

## 红线

- 洁净重写：不得打开或参考 ~/workspace/ai-buddy-mac。零运行时依赖，Node >=20，ESM，用户可见文案简体中文。

## 本模块交付物

1. `packages/adapters/codex.mjs`（单文件，双模式）
   - **notify 模式**（保底通道）：被 Codex 以 `notify = ["<node>", "<本脚本>", "--codex-notify"]` 调用，事件 JSON 在最后一个 argv 里。`type: "agent-turn-complete"` → 状态 done；session 取 thread-id；project 取 cwd 的 basename；last-assistant-message 不发送（隐私），至多取其前 20 字作 title 且要过协议敏感词过滤，过不了就丢弃 title。
   - **hook 模式**（增强通道）：从 stdin 读 JSON，若含 hook_event_name，按 M2 Claude 适配器相同的事件名映射（SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Notification/Stop/StopFailure/SessionEnd）；未知事件 → 只发 beat。
   - 与 M2 适配器同标准：复用 packages/shared 发现 Hub；超时 ≤800ms；任何异常静默 exit 0、无输出；支持 --dry-run 打印将发送的事件。

2. `packages/config-manager/codex.mjs`（Codex 配置管理，与 M2 的 Claude 版并列）
   - 目标文件 `~/.codex/config.toml`（路径可注入）。**不做完整 TOML 解析**，只做保守的行级手术：
     - `enable()`：逐字节备份到数据目录 backups/codex/<时间戳>/config.toml → 检查顶层（第一个 `[section]` 之前）是否已有 `notify =` 行：若是我们自己的（指向 codex.mjs 且含 --codex-notify 标记）→ 幂等返回；若是用户自有的 notify → **拒绝并返回明确错误码 USER_NOTIFY_EXISTS 与人话说明**，不许覆盖；若无 → 在顶层末尾插入我们这行。
     - `disable()`：精确删除我们那一行（按标记匹配整行），其余字节不动。
     - `restore()`：用最近备份逐字节还原（验收夹具用）。
     - `status()`：文件存在性、我们的条目是否在、是否存在用户自有 notify。
   - 测试夹具：①带 sections 与其他顶层键的 config.toml → enable → 断言仅多一行且位置在顶层 → disable → 与原文逐字节一致；②已有用户 notify → enable 拒绝且文件未变；③文件不存在 → enable 新建仅含我们一行，restore 后恢复为不存在。

3. `packages/cli/petlink.mjs`（通用接入 CLI）
   - `petlink send --source <s> --state <state> [--session <id>] [--title <t>] [--project <p>]`：组装事件走 shared 发现并 POST；Hub 不在线时退出码 1 并给人话提示（CLI 是给人用的，可以输出）。
   - `petlink state`：GET /v1/state 并以易读中文格式打印聚合态与会话列表。
   - 参数非法时打印用法并退出码 2。

4. `packages/notifier/`（通知器，库形态，供后续 Electron 主进程集成）
   - 订阅 Hub 的 onAggregateChange（同进程注入 hub 实例或 store）；只对**跃迁到** waiting/done/error 触发，同 (source, session) 60 秒去重；安静时段默认 22:30–07:00（可配置）：不发 Webhook、不触发声音回调，但跃迁照常记录。
   - 动作通道：①回调接口 onNotify(notification)（桌面通知由 M4 的 Electron 层实现，本模块给接口 + 一个 log _sink 默认实现）；②外发 Webhook：POST 用户配置 URL，体为统一事件 JSON 并附加 `kind` 字段：done→"done"、waiting→"confirm"、error→"remind"（与负责人已有短信中转协议兼容）；超时 3 秒，失败重试 1 次，之后记日志放弃。
   - 测试：跃迁过滤、去重、安静时段（时间可注入）、Webhook 体与 kind 映射、失败重试次数——用本地捕获服务器做夹具（你的沙箱跑不了就如实记录，我本机复验）。

5. `scripts/demo-codex-adapter.mjs`（一键演示，全链路）
   - 临时目录夹具 config.toml → 启动 Hub → codex 配置 enable → 子进程以 notify 模式喂 agent-turn-complete → 聚合态出现 done；CLI send 一条 generic waiting → 聚合态 waiting；通知器捕获到两次 Webhook（本地捕获服务器，断言 kind 分别为 done 与 confirm）；disable+restore 逐字节一致 → 清理退出，中文日志。

6. 根 `npm test` 跑全部（94 + 新增）。

## 不做

Cursor 适配器、Electron、桌面原生通知实现、Codex 的 hooks.json 通道（如 notify 通道实测有缺口，先在 M3_RESULT 里回报，不要自行扩大范围）。

## 交付说明

docs/M3_RESULT.md：文件清单、测试结果（含沙箱受限项如实标注）、演示输出摘要、规格不一致或通道缺口回报。
