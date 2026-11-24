# M5.1 结果

## 修改

- 启动阶段执行完毕后，无论阶段成功或失败，同一个控制窗均加载 `control.html`。新增 `boot-report` preload 订阅，在页面加载完成后发送失败项，重开控制窗也重新发送。顶部中文横幅默认隐藏，以 `textContent` 显示失败步骤名称和原始错误堆栈，以及 boot.log 回传指引；失败时显示并聚焦控制窗。阶段运行器保留失败子步骤的名称，后续扫描或托盘成功不会覆盖它。
- 占位 snapshot 补齐 `aggregate:{state:'idle',quiet:false}`，保留控制页所需工具数据、设置、角色列表及空集合。选择简报允许的第二条方案：`character:null`，由 pet 页使用内置角色默认静态帧、默认锚点、缩放和台词降级。`petData()` 防御缺失 aggregate/character/sessions；正常角色就绪后恢复正常动画。
- pet 初始 snapshot 改为非阻塞 Promise 链并 catch，默认渲染与拖动、点击、右键监听先完成注册。IPC 拒绝、永久 pending 或同步抛错都不会阻止注册。
- 仅在内置角色、Hub 服务、数据目录准备三个步骤都成功时创建桌宠；否则报告具体未就绪原因。无桌宠时禁用托盘显示/隐藏项，相关回调、尺寸设置及移动处理容忍桌宠缺席。正常位置恢复、置顶和托盘行为保留。
- 未修改五态协议、Hub、适配器、设置校验和 IPC 命令语义；未新增聊天功能，未调查语言回退。

## 单元测试

命令：`npm test`

最终串行运行原文摘要：

```text
ℹ tests 130
ℹ suites 0
ℹ pass 130
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3917.488513
```

原有 126 项通过，新增 4 项覆盖占位 snapshot 与 pet 降级数据、成功/失败均切控制页且先加载再发报告、三个桌宠前置条件的全部 8 种组合，以及初始 snapshot 拒绝/pending/同步抛错时监听注册、点击摸头与 move/menu 调用。原阶段测试增加失败名称保留断言。

打包和 Electron 冒烟并行时，一轮全量出现 3 个现有适配器耗时断言失败（离线/坏输入、真实 Hub 四事件、Hub 不响应；对应测试耗时约 1833/1676/1095ms）。未修改适配器或放宽测试；待这些负载结束后最终串行运行得到上述 130/130。此前也有两轮全量 130/130 通过。

`node --check`（main.mjs、pet.mjs）与 `git diff --check` 通过。

## Linux Electron 双路径冒烟

可复跑脚本：`node scripts/smoke-m5-1.mjs`，默认使用 `/tmp/petlink-electron42/electron`，可通过 `ELECTRON_PATH` 指定运行时；需 xvfb-run。本次 Electron 42.0.0 Linux x64，`--no-sandbox`，每条路径使用独立临时数据与 Electron 配置，通过 CDP 读取实际页面。

最终原始结果保存在 `docs/m5_1-smoke-results.jsonl`：

- clean：所有启动步骤日志 success，无 failed；实际目标为 control.html，标题“PetLink 控制页”，3 个工具卡片，失败横幅隐藏。pet.html 图片加载成功，合成 pointerdown/up 后显示“摸摸收到啦”，额外等待后进程仍存活。
- corrupted-user-character：创建 `characters/broken/` 而不放 manifest.json。日志确认该用户角色加载失败，其余数据、内置角色、服务、通知、桌宠及托盘步骤 success；实际控制页已切到 control.html，3 个工具卡片正常，横幅包含“加载用户角色 broken”、原始 ENOENT 堆栈和 boot.log 指引。桌宠图片和合成点击检查同样通过，额外等待后进程仍存活。

验证过程中修正了冒烟脚本自身的字符串引号与 DOM 加载等待问题；另一次失败名称断言揭示阶段名称被后续扫描覆盖，已修复并重跑双路径通过。

## Windows 包

构建命令：`node scripts/package-win.mjs`。使用既有缓存的官方 Electron 42.0.0 win32-x64 与隔离 ws 运行时，Linux 交叉组装，**从未运行 Windows 或 Windows exe**。

- 路径：`/home/hatch/workspace/petlink/PetLink-M5.1-Win-诊断版.zip`
- 大小：**160,892,004 bytes**，约 **153.44 MiB**。
- SHA-256：`872950d5854cf5a70505a99acd990c1e9bcd588da4d27a60ac20e751d1500d23`
- ZIP 共 777 个条目、741 个文件，唯一顶层目录 `PetLink-M5.1-Win/`。
- 全部 ZIP CRC 通过；有 PetLink.exe，无 electron.exe；入口 `resources/app/package.json` 的 main 为 `apps/desktop/main.mjs`。
- 包内 apps/packages/characters 的 645 个文件与最终仓库逐字一致，包括新增 pet-data.mjs 与测试；根 node_modules 仅 ws，没有 Electron 开发依赖。
- 中文使用说明文件名具有 UTF-8 标记。大型 ZIP 留在工作目录交付，未提交 Git；原 M5 ZIP 保留。

## 未验证

Windows 实机效果仍须用户复测。Linux 成功不代表 Windows 故障已解决。

未进行 Windows 双击、窗口拖动、系统托盘交互、通知、声音、权限与多显示器实机验收。Linux 点击是合成事件；拖动 move 与右键 menu 链在单元测试中检查，未进行人工鼠标拖动/菜单验收。内置角色失败、Hub 失败、数据目录失败未逐一做 GUI 故障注入，前置条件由纯函数组合测试覆盖。无角色文件可用时静态帧也可能无法加载，但监听仍可注册。原有 Promise.race 不取消底层工作等限制未扩展处理。
