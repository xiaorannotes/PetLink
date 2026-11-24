# M6 P2 交付结果（2026-11-11）

聊天、打字跟随、看向鼠标已实现。验证环境为 Linux / Electron 42 / Xvfb；**从未运行 Windows**，不把交叉打包或本地 mock 当作 Windows 实测。

## 聊天

- 左导航「聊天」；双击桌宠打开 360×480 无边框独立小窗，标题区可拖动、关闭按钮可用。两个 renderer 共用主进程持有的历史与请求状态，不直连模型网络。
- 宠物页聊天设置：完整 OpenAI 兼容 `/chat/completions` 地址、密码框 API Key、模型、人设与恢复默认、清空历史。配置指引按钮定位此分区。地址、Key 或模型缺失时展示指引并拦截请求。
- 默认人设参照本机 Mac `character-catalog.mjs` / `character-english.mjs` 中自家肖大大条目的自然、温暖、可靠、一起拆解困难等口吻要点，另写短提示词；未复制其工程实现或其他角色文案。
- **本窗接的是可配置的模型接口，不是肖大大本人的记忆与会话。本人对接是后续事项，本期未连接任何真实记忆或 session。** 设置卡、主聊天页、小窗、包内说明均标注边界。
- 主进程 fetch：固定 **N=20**，发送最近最多 40 条非错误历史消息（20 轮容量），加当前用户消息及 system 人设；30 秒 AbortSignal 超时；禁止跟随重定向。网络、HTTP、超时、空响应均显示「模型接口暂时没连通，尚未收到回复」错误气泡，不伪装成助手回答。
- 请求期间使用现有 waiting 与「想想哦……」；结束短暂 done，2 秒后回归 Hub 状态。没有扩展五态协议。
- 同数据目录 `desktop.json` 仅本机保存 Key；renderer 快照含 `***`，不回传原文。密码框保存后清空，留空保留现有 Key；清空地址即可停用接口。消息会发送到用户选择的端点。
- 历史只在主进程内存与同目录 `chat-history.json`，最多 100 条，启动恢复，可清空；不进入 boot.log 或诊断。并发发送/清空有等待保护。

## 打字跟随

- 采用优先方案 **uiohook-napi 1.5.5**，包含发布包自带的 `win32-x64/uiohook-napi.node`，通过 `node-gyp-build 4.8.4` 加载；无自行实现底层钩子。上游：[uiohook-napi](https://github.com/SnosMe/uiohook-napi)。
- 包内 `PetLinkTyping.exe` 是独立 Electron 入口进程，与 PetLink.exe 同目录；按可执行文件名分派到 `packages/typing/main.mjs`。复用包内 DLL / 资源，无需用户安装 Node 或 .NET。为确保双击可直接启动，保留第二份 Electron PE 主程序，包体积较大；没有冒充极小原生 EXE。此次预编译库可直接入包，因此未切换 C# fallback。
- 助手独立单实例锁，只有托盘与退出菜单，没有主窗口。主进程默认不启动助手；连接卡开关默认关，打开后启动一次，今后随 PetLink 启动；退出/崩溃不重拉，缺失 exe 的错误被隔离。助手可从托盘独立退出。
- 隐私：`keydown` 监听直接绑定无参数 `counter.increment`，完全不读取事件字段；退格、空格等和其他按键均一次回调计 1。无键值、窗口标题或输入内容的日志/文件路径，无自建内容采集器。只保留内存整数，未按键内容建任何文件。
- 每 5 秒读取相同 `hub.json` / `token` 发现约定，经本机认证 HTTP POST `/v1/event` 上报 `source: typing` 的计数事件；零计数用于连接心跳。Hub 不可用时静默进入下一个上报周期，不弹窗；未接收的该段计数丢弃，不保存离线输入数据。
- typing 事件只允许整数 count（0–1,000,000）、working/idle，拒绝 title/project/beat。现有来源及状态语义保留。
- 最近 10 秒有正计数且真实会话聚合为 idle 时呈现 working；真实 working/waiting/error/done 优先。15 秒无上报显示未连接。概览与连接卡使用真实当日累计；按机器本地日期分日，`typing-counts.json` 仅保存日期与总数，Hub 重启保留总数、不恢复连接状态。

## 看向鼠标与 UI2

- 主进程每 100ms 发送鼠标相对桌宠窗口中心坐标，经 preload 白名单 IPC 进入 pet renderer。
- 纯函数限幅 ±5px / ±2°；CSS 独立 translate / rotate，120ms linear，保留原角色 scale。仅 idle/waiting 且开关开启时生效；working、拖动、手动动作/clip、交互及菜单打开时归零，不叠加动画。菜单关闭通过真实 popup 回调解除。
- 宠物页「看向鼠标」默认开启并持久化。
- 新页、聊天气泡、指引、设置卡和 typing 卡沿用 UI2 米白、奶白、蜜桃粉、奶油黄、暖棕文字、圆角与内联 SVG。截图来自真实 Electron 交互与真实本地 mock fetch，没有改 DOM 伪造会话。

## 测试和审计

最终顺序执行退出码为 0：

| 命令 | 结果 |
| --- | --- |
| `npm test` | **150/150 通过**：原有 136 项、来源枚举新增 typing 的 1 项、13 项功能测试 |
| `node scripts/smoke-m6.mjs` | 通过：经济/投喂、视频播放、解码失败回退、状态动画、合成事件不奖励、启动与摸摸 |
| `node scripts/smoke-m5-1.mjs` | 通过：干净启动与损坏用户角色两种场景 |
| `node scripts/smoke-m6p2.mjs` | 通过：未配置指引/拦截、配置保存/快照遮蔽、双击开 360×480 小窗、真实 HTTP mock 回复、双视图共享、历史落盘/清空、typing 注入 37 次及 working、鼠标开关、boot/诊断无 Key/聊天原文 |
| `git diff --check` | 通过 |

新增测试包含配置校验、未配置不 fetch、真实 HTTP 主进程 relay、20 轮容量/100 条上限与恢复/清空、并发保护、HTTP/网络/空回复/30 秒超时、禁止重定向、boot logger 实际写出遮蔽与诊断序列化白名单、鼠标纯函数限幅与禁用状态、计数器不读取传入对象、source/schema、累计/优先级/超时/跨日/重启持久化、助手源码隐私审计。原有来源枚举测试只为新 typing 来源补充其必填 count；其他来源测试不改行为。

脱敏审计：单测向真正的 boot logger 注入测试 Key，断言输出无原文且含 `***`；诊断导出和 smoke 使用同一 `diagnostics()` 序列化器，白名单排除聊天历史/设置，Key 固定 `***`，并对字符串按已知 Key 脱敏。smoke 实际读 boot.log、写并检查 diagnostics.json，断言测试 Key 与消息原文均不出现。助手源码审计拒绝键码访问、窗口标题访问、写文件与 console 日志路径；poison Proxy 验证回调不读取事件属性。这不是 Windows 全局钩子动态审计。

验证期间 `/tmp` 的 512MB 临时盘一度满，已将 Linux 测试运行时移入忽略的 node_modules 并保留原路径软链接后重跑。Electron 冒烟的进程组清理在沙箱包装中有退出噪声；最终整套在沙箱外顺序运行，退出码 0。未将初次环境失败计作通过。

## 截图

- `docs/ui-shots3/01-connections-typing.png`：概览真实 37 次、typing 已连接卡、默认关闭的随启开关。
- `docs/ui-shots3/02-chat-guide.png`：聊天未配置指引。
- `docs/ui-shots3/03-chat-mini-mock.png`：独立小窗，本地 mock 经真实 fetch 返回的对话。
- `docs/ui-shots3/04-chat-settings.png`：聊天设置分区与明确边界说明。

## Windows 包

已覆盖仓库根目录 `PetLink-M6-Win-诊断版.zip`，未向仓库外复制。

- 大小：**278,040,589 bytes**（265.16 MiB）。
- SHA-256：`8c11e27178066fd3ba2b5e66b09542ae6f134231c6dd31d989a86e2f5a8a1de4`。
- `node scripts/package-win.mjs` 退出码 0；Python `ZipFile.testzip()` 全包 CRC 通过。
- 检查了双 EXE 的存在、助手 PE 的 MZ 头、包内入口分派、uiohook-napi 1.5.5 Windows x64 预编译模块、node-gyp-build、更新使用说明；包内关键源文件与工作区逐字节一致。
- 包内无 desktop.json、chat-history.json、token、boot.log 等运行数据。归档沿用仓库已有忽略规则，不强行将 266MiB 交付二进制加入 Git；源代码、测试、报告与截图提交。

## 未验证项

- **Windows 从未运行**：未验证双击 EXE、托盘、独立单实例锁、开机/随 PetLink 生命周期、全局钩子权限及实际按键计数、原生模块在 Windows Electron 42 中的加载、DPI/多屏鼠标行为。
- **真实远程模型接口未验证**：只验证真实本地 HTTP mock，未使用用户密钥或调用收费服务。
- **真实 Windows 全局钩子表现未验证**：测试的是计数器、事件聚合、隐私代码路径与交叉打包，不代表 Windows 实机兼容性通过。
- API Key 为本机设置文件保存，不是操作系统密钥库加密；未声称加密存储。独立助手采用第二份 Electron 主程序，未声称包体积小。
