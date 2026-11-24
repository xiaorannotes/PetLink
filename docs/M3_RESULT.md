# M3 交付记录

已按 `CODEX_BRIEF_M3.md` 和其引用的 `DEV_DOC.md` 章节独立实现。运行时零第三方依赖，Node >=20，ESM，用户可见日志使用简体中文。

## 文件清单

- `packages/adapters/codex.mjs`：notify / stdin hook 双模式、隐私白名单、20 字标题及协议过滤、未知 hook 仅 beat、共享 Hub 发现、700ms 总预算、失败静默、dry-run。
- `packages/config-manager/codex.mjs`：可注入配置路径、逐字节备份、顶层 notify 插入、用户 notify 冲突拒绝、标记精确删除、字节还原及原文件不存在的还原。写入先在同目录临时文件校验字节，再重命名。
- `packages/cli/petlink.mjs`、`packages/cli/package.json`：send / state、中文输出、参数错误退出 2、Hub 不在线退出 1、workspace bin 入口。
- `packages/notifier/index.mjs`、`packages/notifier/package.json`：Hub/store 注入、聚合跃迁过滤、按来源和会话跨状态 60 秒去重、默认本地时间 22:30–07:00 安静时段、通知与声音回调、默认日志 sink、Webhook、自定义头、3 秒超时、一次重试、kind 映射、取消订阅与 flush。
- 四个新增测试文件：`packages/adapters/codex.test.mjs`、`packages/config-manager/codex.test.mjs`、`packages/cli/cli.test.mjs`、`packages/notifier/notifier.test.mjs`。
- `scripts/demo-codex-adapter.mjs`：临时夹具、Hub、notify、CLI、两次真实 Webhook 捕获与 kind 断言、停用及还原字节断言、清理。
- 本文档。

原有实现、原有 94 个测试及根测试脚本均未修改。根 `npm test` 的既有 glob 自动纳入全部新增测试。

## 验证结果与沙箱限制

本次运行环境为 Node v24.22.1。共 113 个测试（既有 94 + 新增 19）。**不能声称全部通过**：

- 已执行 `npm test`，退出 1；隔离子进程环境下报告 9 个测试文件中 4 个通过、5 个失败。
- 为取得逐项结果，另外执行 `node --test --test-isolation=none packages/*/*.test.mjs`：**100 通过、13 失败、0 跳过**。既有测试 86/94 通过，新增测试 14/19 通过。
- 13 个失败均涉及本机 HTTP 监听或子进程：既有 Claude 适配器 3 个、既有 Hub 5 个、新 Codex 适配器 2 个、新 CLI 2 个、Webhook 捕获服务器 1 个。
- 本地捕获服务器和 Hub 均报 `listen EPERM: operation not permitted 127.0.0.1`。独立 `spawnSync /usr/bin/node` 探针也返回 `EPERM`；异步子进程测试出现空输出。未删除断言、未转换为 skip、未放宽任何既有验收条件。
- 配置管理器所有夹具通过：LF/CRLF、中文、顶层与 sections、重复启用、用户 notify 拒绝、缺失文件恢复、无末尾换行、BOM、注释伪标记、多行值保守拒绝。独立纯逻辑组合测试也通过。
- 通知器的跃迁过滤、跨状态去重、安静时段记录与动作抑制、注入失败传输的恰好两次尝试均通过。真实捕获服务器测试保留全部 body/kind/自定义头/重试次数断言，等待父环境复验。
- 从终端直接执行 notify dry-run 得到包含 `source: codex`、`state: done`、项目 basename 和短标题的事件；直接执行离线 CLI state 输出“无法连接本机 Hub，请先启动 PetLink 并检查本机配置”。

父环境请执行：

```sh
npm test
node scripts/demo-codex-adapter.mjs
```

Node 20 无需支持诊断用的 `--test-isolation=none`；正常验收只用上述两个命令。

## 演示输出摘要

实际执行 `node scripts/demo-codex-adapter.mjs`，退出 1：

```text
演示失败：EPERM listen EPERM: operation not permitted 127.0.0.1
```

失败发生在启动本地捕获服务器时，尚未运行后续链路；临时目录已由 finally 清理。不能把预期输出当作实测结果。脚本在允许监听的环境中断言 notify 后 done、CLI 后 waiting、两次 Webhook 分别 done / confirm，以及 disable 和 restore 各自逐字节一致。

## 保守边界与通道说明

- 按 M3 施工范围不实现完整 TOML 解析。对多行字符串及无法安全判断边界的顶层多行值返回 `UNSAFE_CONFIG`，保留备份、不改原文件；多行用户 notify 返回 `USER_NOTIFY_EXISTS`。不承诺验证所有 TOML 语法错误。
- 无末尾换行时，为插入 notify 增补的分隔换行带行内标记，停用一并摘除，以恢复原字节。已有换行的配置仅新增一行。BOM 与原行尾格式保留。
- 重复 enable 仍备份，但其快照不覆盖安装前的还原基线，与既有 Claude 配置管理器的安全还原语义一致。
- Hub 回调仅包含聚合态，因此从同一个 store 的会话表选择该状态最近进入的会话，构造协议白名单事件，不外发内部会话元数据。仅聚合状态实际变化时触发；同一聚合态下另一会话更新不产生通知。
- 安静时段照常记入有界 history 并计入去重，不补发通知；onNotify、onSound 和 Webhook 均抑制。
- notify 保底通道仅报告完成，无法提供 working / waiting 等状态。已实现增强 hook 输入翻译，但未修改 hooks.json、未启用日志 tail，也未在真实 Codex 宿主验证事件交付。此处是已知通道粒度限制，不宣称完成实机集成验收。
- 本模块不包含 Electron、桌宠截图、Windows/macOS 真机验收。

洁净自查：未打开、读取或参考禁止参考的仓库；新增代码全部独立编写，无外来素材、角色或文案。原有源码与测试的 git diff 为空。
