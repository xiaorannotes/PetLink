# M2 交付结果

实现依据：`CODEX_BRIEF_M2.md` 与 `DEV_DOC.md` 第 0、4.1、8、12.2、15 节。

## 文件清单

- `packages/shared/index.mjs`、`package.json`、`shared.test.mjs`
- `packages/hub/index.mjs`（共享工具抽取；M1 测试文件未改）
- `packages/adapters/claude-code.mjs`、`package.json`、`claude-code.test.mjs`
- `packages/config-manager/index.mjs`、`package.json`、`config-manager.test.mjs`
- `scripts/demo-claude-adapter.mjs`
- `docs/M2_RESULT.md`

根 `npm test` 原有通配符自动纳入所有新增测试，无需改动。零运行时依赖、ESM、Node >=20；本次实际运行 Node v24.22.1。

## 共享抽取与适配器

`defaultDataDir()` 原样迁至 shared，Hub 保留兼容重导出；令牌读取与格式校验共用 `readToken()`。Hub 仍负责创建令牌及权限设置。`discoverHub()` 读取 hub.json，只接受有效整数端口并读取 token；适配器始终向 127.0.0.1 发请求，不信任发现文件中的主机字段。

适配器实现全部九个 hook 映射，仅发送协议白名单字段，不读取或发送提示词、标题；project 仅取 basename，兼容 Windows 路径。正常模式无输出、异常静默 exit 0；从读取 stdin 前开始计时，700ms 总预算覆盖输入、文件发现和 HTTP，留出启动余量。`--dry-run` 仅输出事件 JSON，不发现 Hub、不发网络。

## 配置安全

API：`createConfigManager({ settingsPath, dataDir, nodePath, adapterPath })` 返回 `status/enable/disable/restore`；同时提供默认实例的同名导出。错误返回 `ok:false`、明确 code 和中文原因。

每次 enable 在解析前逐字节备份，目录为 `backups/claude-code/<ISO 时间戳（冒号替换为短横线）及唯一后缀>/`。`settings.json` 保存原字节，metadata.json 记录文件原本是否存在、目标路径，以及快照能否作为安装前还原基线。重复 enable 仍备份，但不让已安装快照覆盖原始还原基线。已有 PetLink 命令会被精确摘除后重建，支持更新脚本路径。写入后重新解析并深度校验；失败回滚本次写入前的字节。

disable 精确摘除同时包含 claude-code.mjs 与独立 --petlink 参数的命令，保留混合条目中的其他 hook。restore 比较摘除 PetLink 后的当前配置与最近安装前备份；其他用户字段变化则返回 CONFIG_CHANGED，拒绝覆盖。空 hooks 容器/空事件列表按等价结构比较；最终还原仍使用原始字节。原文件不存在时 restore 删除新建文件；原空文件恢复为零字节。

测试夹具内嵌于 config-manager.test.mjs，覆盖 CRLF/非标准空白、其他 hooks/杂字段深度保留、损坏 JSON 原样备份且不写、空文件、不存在文件、重复启用、混合 hook、后续修改保护与未启用时不写文件。

## 测试结果与环境限制

- `npm test`：已执行，未全绿。当前沙箱连 Node 默认测试子进程的详细输出也无法正常转发，因此另外使用不隔离模式查看逐项结果；没有改根测试命令或降低断言。
- `node --test --test-isolation=none --test-reporter=tap packages/*/*.test.mjs`：**94 项，86 通过，8 失败，0 跳过**。其中 M1 原有 73 项，M2 新增 21 项。
- 7 项失败是 `listen EPERM: operation not permitted 127.0.0.1`：5 项原有 M1 HTTP 测试、1 项适配器真实 Hub 测试、1 项 Hub 不响应的整体超时测试。
- 另外 1 项 dry-run 子进程测试失败：子进程 stdout 为空，导致 JSON 解析失败。独立最小探针 `spawnSync(process.execPath, ['-e', 'console.log(123)'])` 也报告 `spawnSync /usr/bin/node EPERM`，异步 spawn 同样未获得预期输出。这是额外的子进程环境限制，不能据此声称子进程链路验收通过。
- 通过 shell 管道直接执行 adapter 的 `--dry-run` 已正常输出含 project basename 的事件 JSON。
- 配置安全、协议、共享工具和所有无需监听端口的 M1 测试通过。M1 的源码测试及其断言均未修改；HTTP 部分仍待父环境复验，不能声称 73/73 已在此环境通过。
- `git diff --check` 通过。

## 演示

执行 `node scripts/demo-claude-adapter.mjs`，实际输出：

```text
演示失败：listen EPERM: operation not permitted 127.0.0.1
```

脚本保留真实子进程、真实鉴权 HTTP 与四事件接收断言，未换成模拟或弱化检查。成功路径将打印 working → waiting → done → idle 聚合轨迹，并断言 SessionEnd 的原始会话态为 offline，最终 disable + restore 校验逐字节一致，finally 清理 Hub 和临时 HOME。当前环境尚未验证成功路径。

父环境请执行 `npm test` 和 `node scripts/demo-claude-adapter.mjs` 复验真实监听、子进程发送、整体 ≤800ms 以及演示成功路径。

## 规格与洁净自查

未发现需调整的规格冲突。本模块未实现 Codex/Cursor、Electron 或通知器。施工仅依据本仓库规格与 M1 代码；从未打开或引用禁止访问的参考仓库，新增文件没有引入其代码、文案或素材。新增代码与交付文件已自查。
