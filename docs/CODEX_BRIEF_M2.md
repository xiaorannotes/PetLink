# Codex 施工简报 M2：Claude Code 适配器 + 配置管理器

项目：PetLink。开工前必读：docs/DEV_DOC.md 第 0 节（洁净红线）、4.1（Claude 适配器规格）、第 8 节（配置管理器）、12.2（配置安全验收）、第 15 节。前置成果：M1 的 packages/protocol 与 packages/hub 已验收（73/73 测试），本模块在其之上施工，**不许破坏 M1 测试**。

## 红线

- 洁净重写：不得打开或参考 ~/workspace/ai-buddy-mac。
- 零运行时依赖，Node >=20 标准库，ESM。用户可见文案简体中文。

## 本模块交付物

1. `packages/shared/`（小重构）
   - 把数据目录解析（PETLINK_DATA_DIR 优先、否则平台默认 appdata/petlink）、hub.json 发现、token 读取这三件事抽成共享工具；packages/hub 改为引用它，原有测试必须全绿。

2. `packages/adapters/claude-code.mjs`（适配器脚本，单文件零依赖）
   - 被 Claude Code hooks 以命令方式调用：从 stdin 读 hook 的 JSON 输入（含 hook_event_name、session_id、cwd 等），按 DEV_DOC 4.1 映射表翻译成统一事件。
   - 通过 shared 工具发现 Hub（hub.json 端口 + token 文件），POST /v1/event；整体超时 ≤800ms，**任何异常都静默 exit 0**，绝不向 stdout/stderr 输出东西、绝不阻塞宿主。
   - Hub 不在线时：直接静默退出。
   - 支持 `--dry-run`：不发网络，只把将要发送的事件 JSON 打到 stdout（供测试与用户手动排查）。
   - project 字段只取 cwd 的 basename；不发送 cwd 全路径与任何提示词内容。

3. `packages/config-manager/`（本模块重点，配置安全是验收核心）
   - 面向 Claude Code 的 `~/.claude/settings.json`（路径可注入，方便测试用临时 HOME）：
     - `status()`：文件是否存在、是否已装 petlink 条目、已装的事件列表。
     - `enable()`：先把原文件逐字节备份到数据目录 `backups/claude-code/<ISO时间戳>/settings.json` → 解析 JSON（解析失败：不写、返回明确错误码与人话原因）→ 合并 hooks：为 4.1 映射表的每个事件添加一条 hook，命令为 `<node 路径> <适配器脚本绝对路径>`，条目带可识别标记（命令中含脚本名 claude-code.mjs 且含参数 --petlink）→ 序列化写回（保持 2 空格缩进风格）→ 写后重新解析校验，失败自动用备份回滚。
     - `disable()`：精确摘除全部 petlink 条目；摘除后若 hooks 结构与备份一致性检查通过，进一步提供 `restore()`：用最近一次备份逐字节还原（验收 12.2 的夹具流程用 restore 验证逐字节一致）。
     - 幂等：enable 连跑两次，条目不重复；disable 在未启用时安全返回。
   - **用户原有 hooks 与其他任何字段一律不许动**：合并/摘除前后用深度对比断言（测试里做）。
   - 单元测试夹具至少含：①带既有其他 hooks 与杂字段的 settings.json → enable → 断言原内容全保留且 petlink 条目齐全 → disable+restore → 与原始文件逐字节一致；②损坏的 JSON → enable 拒绝且文件未变；③空文件/文件不存在 → 按新建最小结构处理并可还原为「不存在」状态（删除新建文件）。

4. `scripts/demo-claude-adapter.mjs`
   - 全自动：临时 HOME + 夹具 settings → 启动 Hub → config-manager enable → 用子进程以 dry-run 外的真实方式喂 4 个样例 hook 输入（UserPromptSubmit / Notification / Stop / SessionEnd）给适配器 → 打印 Hub 聚合态变化轨迹 → disable+restore 并校验逐字节一致 → 清理退出。`node scripts/demo-claude-adapter.mjs` 一键跑通、中文日志。

5. 根 `npm test` 跑全部测试（M1 的 73 个 + 本模块新增）。

## 不做

Codex 适配器、Cursor 适配器、Electron 界面、通知器。

## 交付说明

完工写 docs/M2_RESULT.md：文件清单、shared 抽取说明、测试结果（总数与全过情况）、演示输出摘要、规格不一致处（有则先停工回报）。
注意：你的沙箱可能禁止监听本地端口，HTTP 相关测试若在你侧跑不了，如实记录，我会在本机复验——不要为了让测试变绿而改弱断言。
