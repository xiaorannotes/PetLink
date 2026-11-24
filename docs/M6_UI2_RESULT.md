# M6 UI2 交付结果

## 范围与布局

本轮替换 UI1 的横向页签与平铺概览骨架：固定轻顶栏（角色 idle 首帧圆头像、品牌、副标题、状态胶囊）＋ 158px 奶白竖导航＋右侧独立滚动内容区。连接页为大圆头像／状态／现有陪伴语与右侧 2×2 实时指标组成的大状态卡，工具卡改成圆形 SVG 图标、名称状态、右侧按钮的纵向列表行。控制窗口仍由原主进程配置为 980×760，桌宠仍 300×350。

陪伴页采用积分／饥饿双横卡、商店三列卡与价格徽标；动作页采用带 SVG 的分组标题、状态圆点胶囊和居中角色表情卡；宠物、通知、诊断采用同一布局与圆角组件。向导与 boot 使用同色板，boot 居中圆角卡与粉色脉冲／绿色成功／柔红失败阶段点。桌宠仅修改气泡样式。

所有新增图标均为本地创建的内联 SVG；图片只取角色已有帧，无外部字体、图片或 emoji 图标。展示语优先取当前角色 manifest.lines 的首句，否则采用 pet.mjs 已有的状态文案；未新增积分、击键等模拟数值。今日击键继续显示原有「—（打字跟随二期）」。

## 色板与状态映射

| 用途 | 色值 |
| --- | --- |
| 页面／卡片／边框 | `#FBF6EC`／`#FFFDF8`／`#F0E4CE` |
| 主按钮、导航选中 | `#F6A8B8` → `#F28CA0` 蜜桃粉渐变，白字 |
| 积分／价格徽标 | `#FCEBC8` 底、`#8A6420` 字；分类黄 `#F5C66B` |
| 主文字／次文字 | `#5C4A3A`／`#9A8874` |
| 饥饿卡／进度 | `#E8EFDF`／`#7FAE7A` |
| 阴影 | `rgba(180,140,80,.10–.12)` 暖色软阴影 |

字体栈：`"Yuanti SC","YouYuan","PingFang SC","Microsoft YaHei Rounded","Microsoft YaHei",sans-serif`。主标题 24px，按钮与页签胶囊，卡片 20–24px 圆角，输入框 14px 圆角。

| 原状态语义 | UI2 状态色 |
| --- | --- |
| idle 休息 | `#B5AA9A` 暖米灰 |
| working 工作 | `#8EABC3` 柔蓝 |
| waiting 等待确认 | `#D9A64F` 暖黄 |
| done 完成 | `#7FAE7A` 角色绿 |
| error 错误 | `#D98888` 柔红 |

offline 使用 idle 色并降低不透明度；pet／drag／sleep 展示 chip 使用 idle 色。状态判断与五态语义未变。

商店分类仅增加展示用 `data-category`，不参与价格、购买或播放映射：

| 分类／色条 | 食物 |
| --- | --- |
| 主食／粉 `#F6A8B8` | 白米饭、清汤面、大馒头、吐司、三明治、鸡肉便当、兰州拉面、蛋炒饭、韭菜盒子、韭菜鸡蛋水饺、豪华便当 |
| 零食／黄 `#F5C66B` | 小饼干、大白兔奶糖、薯片、巧克力 |
| 饮品／蓝 `#A8C9DF` | 牛奶、果汁 |
| 甜点／紫 `#C7B5D9` | 水果拼盘、小布丁、甜筒冰激凌、芝士蛋糕 |

## 改动文件与边界

- `apps/desktop/control.html`：轻顶栏与 workspace／content 包裹层，保留全部控件 id、data-page 与 main 的直接 section 子节点。
- `apps/desktop/control.css`：完整新布局与组件样式，包括自绘粉色圆头滑块。
- `apps/desktop/control.mjs`：仅展示 DOM 渲染（内联 SVG、角色头像／原来源文案、概览分组、商店分类）。原事件处理器、IPC 命令与参数、设置校验保持原样。
- `apps/desktop/boot.html`：仅 CSS 与阶段点的 CSS content，脚本原样。
- `apps/desktop/pet.html`：仅气泡色板、边框、阴影与字体；播放和拖动代码原样。
- `scripts/screenshot-m6-ui.mjs`：仅截图输出目录从 `docs/ui-shots/` 改为 `docs/ui-shots2/`（mkdir 及六个输出路径）。
- `docs/ui-shots2/`：六张重新生成的真实流程截图。
- 本 RESULT。

未改 main、preload、boot 编排模块、pet.mjs、snapshot、companion 结算、通知、设置验证、测试文件或两套 smoke 脚本。

## 选择器与断言清单

**冒烟选择器变更：无。** `#tools article`、`#shop article`、`#backpack button`、`[data-page]`、`#action-list button`、桌宠 img/video/bubble 及 boot-report 均保持兼容。截图脚本也没有选择器或断言变更；只改输出路径。两套 smoke 和截图脚本没有删除、放宽或跳过任何断言。

## 验证

最终顺序验证（Linux、现有 Electron 42、Xvfb/CDP）：

- `npm test`：136/136 通过，0 失败、0 跳过。
- `node scripts/smoke-m6.mjs`：通过，退出 0；验证真实购买／投喂、视频播放、强制解码失败回退与恢复、状态动画、模拟事件不奖励、启动阶段成功与存活。
- `node scripts/smoke-m5-1.mjs`：通过，退出 0；clean 与 corrupted-user-character 两个场景均通过，包括错误 banner 与 boot.log 的断言。
- `node scripts/screenshot-m6-ui.mjs`：最终交付重跑通过，退出 0；六图重新输出，全部原有断言通过。
- `git diff --check`：通过。
- Windows zip 完整 CRC 检查通过；包内 control.html／control.css／control.mjs／boot.html／pet.html 与当前源码逐字节一致。

首次 smoke-m6 在恢复 idle 断言处见到 `frames/pet/pet/frame_009.webp`（预期 `frames/idle/`），当时返回了摸摸帧。随后未改播放逻辑、断言、选择器或等待时长，独立顺序重跑通过；保留此首次失败记录，不将其描述为从未失败。首次截图流程也完成了全部断言并输出结果，但其工具会话收尾返回 143；最终顺序重跑的退出情况见上方最终记录。

收尾追加重跑时 `/tmp`（512MB tmpfs）耗尽，一次截图运行在 clean 场景 bannerHidden 断言失败（false 而非 true）；清理本轮已完成的临时 Electron 测试目录后重跑。未修改启动逻辑或放宽断言。

六图：连接 `01-connections.png`、陪伴 `02-companion.png`、动作 `03-actions.png`、宠物设置 `04-pets.png`、桌宠待机 `05-pet-idle.png`、桌宠吃法 `06-pet-eating.png`，均在 `docs/ui-shots2/`。已逐张查看；旧 `docs/ui-shots/` 未修改。陪伴数据由新数据目录真实初始化、购买白米饭、投喂产生：积分 2→0，背包 1→0，饥饿恢复至接近 100。截图不是注入的假 snapshot。

## Windows 包与未验证项

- 文件：仓库根目录 `PetLink-M6-Win-诊断版.zip`
- 大小：**180,534,405 bytes**
- SHA-256：`672fc0c87eaaf395b0fee875b9c3319ab4a74e1483811d44773dc5e389189bba`
- 使用原有 `node scripts/package-win.mjs` 重建，Electron 42.0.0 Windows x64；未更改打包脚本。


只在仓库根目录重建 `PetLink-M6-Win-诊断版.zip`，没有向仓库外复制。该 zip 沿用仓库既有 `.gitignore` 规则，不纳入 Git；源码、截图和 RESULT 提交。与 `your_files` 的同步由主控完成。

**Windows 从未运行，本轮未做 Windows 实机验证。** Linux Electron/CDP 的通过不能替代 Windows 的字体、托盘、通知、DPI、透明窗口与解压启动验证。截图所用 Linux 系统字体可能与 Windows 不同；向导／boot／通知／诊断已做静态样式检查与相应既有冒烟覆盖，但不属于此次要求的六张交付截图。
