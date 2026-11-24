# M5 结果

## 实现

- `main.mjs` 在其他启动逻辑前同步建立 boot.log；优先 exe 同目录，不可写则尝试创建 userData 目录并回退，日志注明实际路径；两处不可写也继续运行。首行含 entry、时间、平台和版本。未捕获异常和 rejection 记录原始堆栈，并尽量弹出错误框。
- ready 后先创建控制窗口并加载无 snapshot 依赖的 boot.html，随后才准备目录、读设置、加载角色和启动服务。通过 preload 的专用事件推送四阶段进度，页面用 textContent 显示原始堆栈；后续子步骤成功不会覆盖同阶段之前的失败。
- 每个启动步骤独立捕获错误；内置及用户角色加载、startHub 都有 Promise.race 的 20 秒期限。内置角色或 Hub 失败时跳过桌宠，独立步骤继续。全部成功才在同一窗口切换 control.html，保留未 onboard 时聚焦控制页的语义。
- snapshot 在 Hub 或角色尚未就绪时直接返回 `booting:true` 和控制页可用的空集合、工具占位数据，不访问 Hub。原 control/pet 页面、协议、Hub、适配器、通知实现与设置校验均未修改。
- 单实例锁失败会同步记日志、显示指定中文提示再退出；退出清理兼容 Hub/通知尚未建立。
- 删除入口顶层 `await app.whenReady()`，改为 ready 回调。Linux 42 冒烟中，保留顶层等待时只留下 entry、25 秒内无控制页；改为回调后完成了全部启动阶段。这是本环境的观测，不将其认定为 M4 Windows 故障的已确诊原因。
- 新增 `scripts/package-win.mjs`，固定下载官方 Electron **42.0.0 win32-x64** 到 `~/.cache/electron-petlink/`，校验 zip 可解压后缓存；复制 electron.exe 为 PetLink.exe 并移除旧 exe 名，其他运行时文件保留。复制根 package.json 并设置 main，组装 apps/packages/characters，根 node_modules 仅复制 ws，附中文使用说明；用 Python zipfile 为中文文件名设置 UTF-8 标记，避免 Windows 解压器误读。

## 单元测试

命令：`node --test packages/*/*.test.mjs apps/desktop/*.test.mjs`

最终运行原文摘要：

```text
ℹ tests 126
ℹ suites 0
ℹ pass 126
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6155.770498
```

原有 119 项测试全部通过，新增 7 项覆盖阶段失败后继续、失败状态和堆栈保留、超时及定时器清理、精确默认 20 秒期限、占位 snapshot、日志优先路径失败后的回退、两个路径及弹窗均失败时不抛错。

初次基线 119/119 通过。构建负载期间两次运行触发现有 Claude Code 适配器测试的 800ms 时限断言（约 875.5ms / 877.5ms）；未修改该测试或适配器，随后全量通过（125/125，补充精确超时测试后为上述 126/126）。`node --check` 和 `git diff --check` 也通过。

## Linux Electron 冒烟

使用缓存中的 Electron 42.0.0 Linux x64、xvfb、`--no-sandbox` 和独立 `/tmp` 配置/数据目录，仅验证本 Linux 环境：

- 首次因默认配置目录只读而抢锁失败，boot.log 记录指定提示，错误框内容出现在输出中。
- 采用可写临时目录并修正 ready 编排后，日志出现所有步骤 running/success；DevTools 目标同时包含 pet.html 与 control.html。
- 通过 DevTools Runtime.evaluate 读取控制页实际正文与 snapshot：向导、连接卡片正常渲染，snapshot 返回正常服务数据。
- 故意创建缺少 manifest.json 的用户角色目录，启动诊断页保留“加载角色：失败”和 ENOENT 原始堆栈，服务阶段成功；抓取时桌宠阶段进行中，没有将该页切走。未据此声称此失败场景后续托盘或桌宠已验证。
- 环境有 D-Bus 等系统日志，未进行声音、系统托盘交互、通知或跨桌面验收。

## Windows 诊断包

构建命令：`node scripts/package-win.mjs`（Linux 交叉组装，没有执行 Windows exe）。

ws 使用隔离前缀 `~/.cache/electron-petlink/ws-runtime/` 安装 `ws@8.18.3`，npm 成功获取 1 个包，无需离线兜底；只复制其 node_modules/ws，未把 Electron 开发依赖或工作区链接装入归档。

最终路径、大小与清单核验见下方构建核验记录。zip 为交付文件，未将大型二进制归档提交到 Git。

## boot.log 预期行样例

时间、路径、版本以实际运行环境为准，以下是格式示例：

```text
2026-11-11T03:43:21.793Z [boot] entry platform=win32 version=0.1.0
2026-11-11T03:43:21.793Z [boot] log path: C:\PetLink-M5-Win\boot.log
2026-11-11T03:43:23.630Z [boot] control window created
2026-11-11T03:43:23.630Z [boot] 准备数据目录: running
2026-11-11T03:43:23.744Z [boot] 准备数据目录: success
2026-11-11T03:43:23.775Z [boot] 加载内置角色: running
2026-11-11T03:43:24.070Z [boot] 加载内置角色: success
2026-11-11T03:43:24.072Z [boot] 启动服务: running
2026-11-11T03:43:44.072Z [boot] 启动服务: failed
Error: 启动服务: timeout after 20s
```

抢锁失败行：`[boot] single-instance lock failed: another instance may be running`。

## 未验证与限制

**从未运行 Windows，也未在 Windows 实机验收。构建成功、归档核验和 Linux 冒烟均不等于 Windows 可用。** 用户电脑上以 PetLink.exe 的实际行为和 boot.log 为准，M4 原始死因仍未确诊。

- Windows 的 exe 双击、权限回退、系统弹窗、单实例进程、托盘与更新覆盖操作均未实机测试。
- 真实 20 秒挂起通过纯函数假时钟验证，未对 Electron 内部 loadCharacter/startHub 注入真实长时间挂起。
- Promise.race 不取消底层工作；超时后页面保留失败，晚返回的 Hub 会尝试关闭。
- Linux 正常路径与人为用户角色失败已冒烟；内置角色损坏、Hub 启动失败、两处日志不可写及未捕获异常的完整 GUI 场景未逐一实机触发，相关核心行为由单元测试覆盖。

## 最终构建核验记录

- 路径：`/home/hatch/workspace/petlink/PetLink-M5-Win-诊断版.zip`
- 大小：**160,886,155 bytes**（约 153.43 MiB）。
- SHA-256：`947684c26e3bf94008f26edf3cfe868c0f05788e7fd82a972f210f07f06ed184`
- ZIP：775 个条目，739 个文件，唯一顶层目录 `PetLink-M5-Win/`。
- 顶层文件：`LICENSE`, `LICENSES.chromium.html`, `PetLink.exe`, `chrome_100_percent.pak`, `chrome_200_percent.pak`, `d3dcompiler_47.dll`, `dxcompiler.dll`, `dxil.dll`, `ffmpeg.dll`, `icudtl.dat`, `libEGL.dll`, `libGLESv2.dll`, `resources.pak`, `snapshot_blob.bin`, `v8_context_snapshot.bin`, `version`, `vk_swiftshader.dll`, `vk_swiftshader_icd.json`, `vulkan-1.dll`, `使用说明.txt`。
- `resources/app/` 含根 package.json（main 为 `apps/desktop/main.mjs`）、apps、packages、characters；根 node_modules 唯一子目录为 ws，无 Electron 开发依赖。
- 已直接读取归档断言 PetLink.exe 存在且 electron.exe 不存在，入口与所有新增启动模块/页面/测试及 preload 内容与最终仓库逐字一致，打包入口与 node_modules 清单正确。
- ZIP 全部 CRC 校验通过；`使用说明.txt` 文件名具有 UTF-8 标记，正文按 UTF-8 解码正确。
