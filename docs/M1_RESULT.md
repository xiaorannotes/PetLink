# M1 交付记录

日期：2026-11-08。实现已落地，验收尚未完成：当前执行沙箱禁止监听回环端口，真实 HTTP 测试和演示未能跑通，不声明全过。未因环境限制更改接口或监听规则。

## 文件清单

- `package.json`：私有 ESM 根包、Node >=20、workspaces、根目录 `npm test` 与 `npm run demo`。
- `packages/protocol/package.json`、`index.mjs`、`protocol.test.mjs`：事件校验、枚举、纯函数派生态与聚合、63 项测试。
- `packages/hub/package.json`、`index.mjs`、`hub.test.mjs`：HTTP Hub、会话存储、鉴权、令牌与发现文件、订阅出口、10 项测试。
- `scripts/demo-hub.mjs`：真实 HTTP 演示与临时目录清理。
- `docs/M1_RESULT.md`、`docs/M1_TEST.txt`、`docs/M1_DEMO.txt`：交付说明及本次实际执行日志。

## 设计取舍与调用方式

选用 npm workspaces，两个包职责独立，后续主进程可以直接引入；包间当前使用相对 ESM 导入，无需安装或构建即可测试。运行时和开发测试均未引入第三方依赖，只使用 Node 标准库。

`startHub(options)` 从 `packages/hub/index.mjs` 导出，默认端口 17321，仅绑定 127.0.0.1。仅 EADDRINUSE 才逐端口递增，其他错误立即报出；到 65535 后终止，不静默换地址。绑定成功才原子重命名写入 `hub.json`，内容严格为 `{port,pid,version}`；关闭时只清理仍属于自身的发现记录。测试可用端口 0 获取系统空闲端口。

数据目录优先 PETLINK_DATA_DIR，其次 macOS 的 `~/Library/Application Support/petlink`、Windows 的 `%APPDATA%/petlink`（缺省回退用户 AppData/Roaming）、Linux 的 `$XDG_DATA_HOME/petlink`（缺省 `~/.local/share/petlink`）。无用户配置管理器。令牌通过独占创建生成 32 字节随机值的十六进制文本，已有文件复用，权限设置为 0600，非法文件明确拒绝启动。令牌不会出现在状态接口、诊断日志或演示输出中。

校验拒绝额外字段、非法版本/来源/状态/毫秒时间戳、非 basename 的 project、非布尔 beat；title 按 Unicode 码点计长，敏感词大小写不敏感，命中整条拒绝。依据 DEV_DOC 4.4 预留 `muse` 来源。拒绝事件仅记时间与原因码，不保存被拒绝的原始负载，避免诊断日志留存密钥。

会话以 `[source,session]` 的 JSON 表示作为键，接收时钟用于陈旧与完成计时，客户端 ts 留作明细，避免客户端时钟偏差控制生命周期。working 超过 90 秒 quiet、超过 600 秒降 idle 并标 suspectedEnded；waiting 不超时降级。降 idle 后心跳不恢复工作，新的工作事件可以恢复。done 满 8 秒回落，同会话新的 working 立即接管；另一个会话 working 不覆盖尚未过期的 done，因为 done 优先级更高。无活跃会话时聚合为 idle，offline 不参与。

300ms 内同会话同状态/项目/标题的重复事件合并，不延长完成窗口；心跳只更新最近接收时间和客户端时间戳，不覆盖状态、标题、项目或状态开始时间，也不直接发布聚合变化。未登记会话的心跳以 UNKNOWN_SESSION 拒绝，避免心跳创建状态。定时器每秒检查时间变化，也可注入时钟并调用 `store.refresh()` / `snapshot()`。

订阅使用 `hub.onAggregateChange(callback)`，返回取消订阅函数；仅聚合 state/quiet 变化时发布。会话与最近 100 条日志保存在本进程内存，可从 `hub.store.log` 读取，通过 `clearLog()` 清空，不落原始事件文件。GET /v1/state 返回 `{aggregate,sessions}`，GET /healthz 仅返回 `{ok,version}`。事件请求限制 16 KiB。

## 实际测试结果

环境：Node v24.22.1、npm 10.9.4。已实际运行根目录 `npm test`，退出码 1；当前环境隔离子进程的默认报告仅展示两个测试文件（协议文件通过、Hub 文件失败）。为获得逐项结果，另外实际运行：

```sh
node --test --test-isolation=none --test-reporter=tap packages/protocol/protocol.test.mjs packages/hub/hub.test.mjs
```

此补充命令的隔离参数用于本次 Node 24 环境取证，不属于 Node 20 项目的运行要求；根测试命令仍为标准 `node --test`。

实际逐项摘要（完整输出见 M1_TEST.txt）：

```text
1..73
# tests 73
# suites 0
# pass 68
# fail 5
# cancelled 0
# skipped 0
# todo 0
```

63 项协议测试全部通过；10 项 Hub 测试中 5 项不依赖监听的测试通过。5 项失败均在真实 HTTP 服务绑定阶段报 `listen EPERM: operation not permitted 127.0.0.1`，包括端口占用测试的占位服务。没有跳过、模拟网络或修改预期来伪造通过结果。HTTP 鉴权、真实请求链路、端口顺延及发现文件的集成断言仍需在允许监听回环端口的环境重新执行。

## 实际演示结果

已实际执行 `node scripts/demo-hub.mjs`，退出码 1，输出摘要如下（完整输出见 M1_DEMO.txt）：

```text
中枢已关闭，临时数据已清理
Error: listen EPERM: operation not permitted 127.0.0.1:17321
```

因此本次没有实际产生聚合态变化日志或最终快照。脚本已实现按序发送 claude-code working → waiting → done、codex working，打印中文变化及完整最终快照，并检查最终聚合 done / 两条会话；必须在允许监听的环境重跑，不能将这段预期当作实测结果。

## 范围与洁净自查

实现仅限本模块，没有适配器、配置管理器、Electron 或通知器。先阅读了施工简报与开发文档。本模块所有代码与测试独立编写；未打开、引用或复制禁止访问的仓库、代码、文案和素材，检查范围仅为当前仓库新增实现文件。

没有主动变更规格；交付缺口是受当前沙箱限制，未取得测试全过与演示成功的验收证据。当前权限策略不允许提权，不能在此执行沙箱外验证。后续需在可监听本机回环端口的 Node >=20 环境运行 `npm test` 和 `node scripts/demo-hub.mjs` 后补记真实结果。
