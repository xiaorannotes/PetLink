# M6 UI 交付结果

2026-11-11。仅改展示层；没有更改 IPC、命令参数、snapshot、结算、设置校验、播放、拖动或窗口尺寸。control.mjs 的改动仅用于 DOM 分组、卡片、进度条和状态 class；pet.mjs 未修改。没有新增外部资源、字体或运行时图片。

## 色板

| 用途 | 色值 |
| --- | --- |
| 品牌、主按钮、选中页签、进度条 | #7fae7a |
| 顶栏（深绿仅用于顶栏） | #2f4f43 |
| 页面、气泡 | #faf7f1 |
| 卡片 | #ffffff |
| 正文 | #50634f |
| 积分、价格、焦点 | #e8a04c |
| 失败文字 / 浅底 | #b75450 / #fff0ed |

统一字体栈为 PingFang SC、Microsoft YaHei、Segoe UI、sans-serif。标题 22px，正文 14px/1.6；卡片 16px 圆角，气泡 18px 圆角，间距以 8/16/24px 为主。连接概览五格、工具状态点、商店和背包卡片、动作分组、表情卡、对齐设置表单、通知与日志、居中向导和启动阶段样式均已覆盖。

## 状态色映射

顶栏、会话行和动作 chip 共用 CSS 变量。

| 状态 | 色值 |
| --- | --- |
| working | #759fc1 蓝 |
| waiting | #e8a04c 橙 |
| done | #7fae7a 绿 |
| error | #d9534f 红 |
| idle | #a7ada6 灰 |
| offline | #a7ada6 灰，并保留离线淡化 |

启动阶段使用同一套蓝/绿/红，进行中脉冲，成功勾与失败叉由 CSS 绘制。

## 改动文件

- apps/desktop/control.html：概览与积分容器、顶栏状态、默认页签展示。
- apps/desktop/control.css：完整暖色视觉系统与所有控制页面组件。
- apps/desktop/control.mjs：指标、商店、背包、动作分组的展示 DOM；工具/会话/聚合状态 class。
- apps/desktop/pet.html：气泡、描边、阴影、向下尾巴和字体；尺寸与播放元素保持原样。
- apps/desktop/boot.html：启动页面视觉与阶段标记；脚本未改。
- scripts/smoke-m6.mjs：唯一既有测试选择器更新，详见下节。
- scripts/screenshot-m6-ui.mjs：独立真实 Electron/CDP 截图与流程验证脚本，沿用 M6 冒烟流程。
- docs/ui-shots/：六张原始 PNG。
- docs/M6_UI_RESULT.md：本报告。

## 测试与截图

- npm test：136 项通过，0 失败、0 跳过。
- node scripts/smoke-m6.mjs：通过；真实陪伴分 2，购买后积分 0，米饭 1→0 份，投喂后饥饿 >99；视频播放、解码错误帧回退与自动恢复、状态动画、模拟事件不奖励均通过。
- node scripts/smoke-m5-1.mjs：clean 与 corrupted-user-character 两场景通过，包括失败横幅、摸摸互动与启动日志。
- node scripts/screenshot-m6-ui.mjs：通过；无修改 DOM / snapshot / 余额造数，使用界面按钮执行购买和投喂。陪伴页显示投喂后积分 0、今日陪伴分 2、饥饿 99/100（沿用原有向下取整，实时衰减使原值略低于 100）。
- git diff --check：通过。打包后逐字节核对包内五个改动 UI 文件与工作区一致。

唯一既有测试改动：scripts/smoke-m6.mjs 的购买定位从 `#shop p` 改为 `#shop article`，因为每件商品由文字行改为 article 卡片。仍按「白米饭」定位并点击购买；全部原断言保留。没有删除测试或修改断言。*.test.mjs 均未修改。

首次截图和冒烟重叠运行，争用固定 CDP 端口与 boot.log，出现启动日志断言和目标发现失败。随后按截图脚本 → M6 冒烟 → M5.1 冒烟顺序独立重跑，全部退出码 0；未改变应用逻辑来处理这次验证环境冲突。

截图为 Linux Electron 42 / Xvfb 实际窗口捕获，控制窗口 980×760、桌宠 300×350；页面保留真实滚动区域，不拼接、不修图。

| 场景 | 路径 |
| --- | --- |
| 连接，初始积分 2 | [01-connections.png](ui-shots/01-connections.png) |
| 陪伴，购买并投喂后 | [02-companion.png](ui-shots/02-companion.png) |
| 动作 | [03-actions.png](ui-shots/03-actions.png) |
| 宠物设置 | [04-pets.png](ui-shots/04-pets.png) |
| 桌宠待机 | [05-pet-idle.png](ui-shots/05-pet-idle.png) |
| 桌宠吃白米饭播放中 | [06-pet-eating.png](ui-shots/06-pet-eating.png) |

## Windows 诊断包

运行 `node scripts/package-win.mjs`，覆盖仓库根目录 `PetLink-M6-Win-诊断版.zip`。按现有 .gitignore，该大型交付包留在本地、不进入 Git；源码、截图和报告提交。

- 大小：180,532,494 bytes
- SHA-256：`c47f38d576c3a2e42a8b76b75ba23c2695dddc193606ef506774d390527d5de1`

## 未验证范围

Windows 从未运行。Windows 实机启动、字体回退与渲染、透明气泡合成、通知、托盘、原生拖动等未实机验证。测试和六张截图来自 Linux，不能作为 Windows 验证结论。启动页、向导、通知页、诊断页已改样式，但不在要求的六张截图内，没有单独的视觉验收截图。
