# M6 Phase 1 交付记录

2026-11-11。从 VM 重启留下的未提交实现继续，保留并修复 companion、控制页、pet、Hub 和打包改动，没有重做项目。Phase 1 已完成；Phase 2（聊天、打字跟随助手、看向鼠标）未实现。**Windows 从未运行，本记录不代表 Windows 可用性验收。**

## 与一期简报逐项对照

| 项目 | 结果 |
| --- | --- |
| 钱包、账本、requestId 幂等 | `packages/companion/` 原创实现，整数积分、完整流水；串行事务，临时文件 rename 后更新内存，持久化到 dataDir/companion.json。重复 requestId 不再次结算或播放。 |
| 陪伴分 | 启动及主进程打开控制页时尝试；按本地日期每日一次，同时间隔至少 20 小时；被挡不占当天机会。无 renderer 发分命令。 |
| 任务奖励与今日任务数 | Hub 非心跳、非合并的 acceptedEvent 中 done 才结算；source/session/ts 组成幂等键，重启后仍去重。连接/通知测试用主进程内部 synthetic 标记排除，不改变外部五态协议。今日完成数来自当日本地落账的真实 done，不拿聚合状态变化计数。 |
| 21 种食物与购买 | 目录按 brief 的 portions/restore/price/unit 实现；余额不足禁用按钮并提示，后端再次校验。目录及 21 种 food→clip 映射只在 companion 定义；未知食物映射默认 bowl（购买/投喂仍拒绝未知 id）。 |
| 饥饿与投喂 | 按时间衰减，扣一份、恢复饥饿、记录 delta=0 的 feeding 流水；先落盘再调用播放，播放失败不回滚。满腹拒绝且不扣份。右键背包子菜单复用同一 feed 路径。 |
| clips 与旧包兼容 | manifest 登记 7 个 VP9-alpha webm 和各两张 fallback 静帧；clips 可选，旧包无 clips 可加载。路径校验拒绝绝对路径、上级目录、URL、反斜杠及编码穿越；实际加载还用 realpath 防软链接越界。附加 states 动作和 emotions 同样校验。 |
| pet 播放 | preload 接收 play-clip；透明 video 播一次后恢复逐帧；失败或超时播放 fallbackFrames 一轮。手动状态一次性覆盖，表情短暂静帧展示，角色切换取消旧播放。修复 Chromium 后台暂停视频：仅 pet 窗口关闭 backgroundThrottling。 |
| 状态补齐 | waiting/waiting 123 帧、error/fail 171 帧、offline/sleep-loop 124 帧，24fps；每组所有帧 SHA256 均不同，没有静帧复制凑数。done/jump 原片仅 0.5 秒，真实提取 12 帧；保留原 done/wave 120 帧可展示。三个旧占位文件仍在磁盘，但 manifest 不再引用。 |
| 表情 | 8 张 emotion-* 自有静帧在动作页预览，标注“表情”，点击通过现有逐帧通道临时展示；没有独立表情叠加层。 |
| 动作页、右键入口 | 列出角色全部 states 动作、7 个 clip、8 张表情；右键可打开动作页。用请求序号区分重复打开同页，修复初次快照早于按钮绑定导致跳页失效的问题。 |
| 连接页概览 | 聚合状态、当日 done 数、积分、饥饿；今日击键明确显示“—（打字跟随二期）”。 |
| 测试、Linux 冒烟与 Windows 出包 | 详见下面。 |

## 费率与常量

实现集中在 `packages/companion/index.mjs` 的 RATES / FOODS。

| 常量 | 值 |
| --- | --- |
| 初始积分 | 0 |
| 陪伴分 | +2 / 本地日，且距上次成功 ≥72,000,000ms（20 小时） |
| 真实任务 done | +3，source/session/ts 幂等 |
| 初始饥饿 | 80 |
| 饥饿范围 | 0–100 |
| 饥饿下降 | 每小时 5，按实际毫秒计算，可含小数；界面向下取整 |
| 投喂 | 每次扣 1 份，恢复目录每份 restore，上限 100；积分变化 0 |
| 商店 | 21 种；价格为整包价，份数与恢复值按 brief 原表，无额外来源或赠品 |
| clip / fallback | 登记 5000ms；视频超时保护额外 2000ms；两张 fallback 按登记时长播一轮 |
| 表情展示 | 3000ms 后恢复 |

## 素材与洁净实现

`scripts/build-m6-assets.py` 仅读取授权的 `~/workspace/ai-buddy-mac/resource-root/assets/pet-characters/claude` 媒体：7 个 eat 目录的 motion.webm / static-0000.webp / static-0075.webp，waiting/fail/sleep-loop/jump 视频，以及 8 张 emotion 静帧。没有复制 fork 代码、食物图标或官方图形素材；商店使用文字。新逻辑按本仓库 brief 原创编写。

新增状态通过 FFmpeg libvpx-vp9 解码保留透明度，24fps、256×280、lossless WebP；视频及吃法静帧直接复制。角色包许可仍为负责人自有生成素材、仅供 PetLink 内测。已有 sleep 仍复用 idle 首帧，是静态睡眠近似，未冒充新睡眠动作。表情建议继续保持预览范围，独立叠加层需未来另立规格。

## 验证结果

- 接手时 `npm test`：134 项中 132 通过，失败分别为未登记 clips 的测试前提、pet 测试替身缺少 onPlay。已修复实现/素材并更新替身，没有删除既有回归测试。
- 最终 `npm test`：**136/136 通过，0 失败、0 跳过**。覆盖账本/并发幂等、每日一次与 20 小时（被挡不占机会）、余额不足、满腹拒绝、落盘先于失败播放、重启持久化、21 种映射、Hub 心跳/合并/模拟排除、旧包兼容与路径安全、真实帧唯一性。
- `npm run demo:desktop`：通过，1030 个被引用的独立逐帧文件、9 个状态/互动映射、六页资源与既有三背景预览齐全；额外校验 clip/表情文件存在。
- `node scripts/smoke-m6.mjs`：Linux Xvfb + Electron 42.0.0 + CDP 通过，使用全新临时 dataDir。启动所有阶段成功；控制页实际点击陪伴购买米饭及投喂：积分 2→0，背包 1→0，饥饿约 79.998→99.999；pet 收到 eat-bowl，视频 time≈0.489 秒且无播放拒绝；动作页点击 eat-noodles 收到事件并播放后恢复；主动触发 video error 后先后显示两张 candy fallback，随后恢复 idle；waiting 连续采样帧不同；连接测试未加分；pet 无 JS error。
- 冒烟早期发现 Chromium “video-only background media was paused to save power”，先发生了正确降级；关闭 pet 后台节流后重跑实际视频成功，未用启动参数强行放过检查。
- `node scripts/smoke-m5-1.mjs`：Linux 干净启动和损坏用户角色两场景通过，控制页可操作、pet 可加载和摸摸，损坏角色告警保留且不阻塞桌宠。
- `git diff --check`：通过。

## Windows 包核验

`node scripts/package-win.mjs` 成功生成 `PetLink-M6-Win-诊断版.zip`。

- 大小：**180,530,302 bytes**（约 172.17 MiB）。
- SHA256：`8b6a18ac288fd89ece469b961bd1e3858d0612af9a6a0a852e6847dc2a6fe802`。
- 1253 个 ZIP 条目，全部位于唯一顶层 `PetLink-M6-Win/`，CRC 全部通过。
- `PetLink.exe` 存在，PE 的 MZ 文件头有效；原 electron.exe 已更名；应用入口为 `apps/desktop/main.mjs`，包含 ws 运行时依赖。
- ZIP 内 apps / packages / characters 的 **1108 个文件逐字节匹配当前工作树**；manifest 引用的 1059 个媒体文件全部存在，含 7 个 clip 和 8 张表情。
- 这只是包结构和字节核验；未执行 Windows 二进制。

压缩包是本地交付产物，不写入 Git；`.gitignore` 排除根目录 PetLink Windows 诊断压缩包。已有 M5 / M5.1 压缩包保留未改。源码、素材、测试和本记录一起提交。

## 未验证项与边界

- **未运行任何 Windows 实机或虚拟机**。Windows VP9-alpha 合成、透明边缘、DPI/多屏、托盘/右键原生交互、通知和用户适配器链路仍待 Windows 验收。Linux CDP 是自动化运行检查，不是人工 Windows 视觉验收。
- Linux smoke 检查控制页购买/投喂和播放；右键原生菜单的人工点选未自动化，代码复用 feed / showControl。任务奖励用独立 Hub 单测中的测试事件验证，没有宣称观察到用户真实完成的外部任务。
- JSON 损坏会在陪伴初始化阶段报错并由既有启动降级展示，不重置余额。账本随历史增长，当前未做压缩或跨进程写入协调（应用既有单实例锁）。
- Phase 2 完全未实现：没有聊天配置/聊天窗、全局击键采集、typing source 或看向鼠标，也没有接入个人记忆。
