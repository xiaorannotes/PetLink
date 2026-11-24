# M6 简报：Mac 版「肖大大Ai桌宠」v13 功能全量迁移 + 聊天（用户 2026-11-11 确认立项）

## 总纲
把大宝 Mac 版「肖大大Ai桌宠」v13 的陪伴功能迁进 PetLink（洁净重写：逻辑按行为规格原创实现，**不复制 AI Buddy 源码**；素材只用自家肖大大素材）。分两期：一期＝陪伴经济闭环（积分/商店/背包/投喂+吃法动画/动作展示/概览+状态与表情补齐）；二期＝聊天窗、打字跟随 Windows 助手、看向鼠标。二期在一期验收后另行派工，本简报先把两期规格都写清，一期只做一期范围。

参考源（只读，不改）：Mac fork `~/workspace/ai-buddy-mac`（src/food-catalog.mjs、CODEX_BRIEF_ECONOMY.md、CODEX_ECONOMY_RESULT.md、CODEX_BRIEF_EAT.md、DELIVERY 记录 `~/workspace/goals/ai-buddy-mac-muse/hidden_files/DELIVERY_2026-11-04.md`）。

## 一期规格

### 1. 陪伴经济（全新模块 packages/companion/，数据落 dataDir，JSON 持久化即可，不引入数据库）
- **钱包与账本**：整数积分；每笔发放/消耗记账本条目 {kind, delta, balance, requestId, ts}；requestId 幂等——同一 requestId 重复提交不重复记账。
- **陪伴积分（唯一新来源，照 Mac 版定版费率）**：应用启动成功、或打开控制页时尝试发放 **+2 分**，kind=`local-companionship`；约束：按本地日期每日最多成功一次，且距上次成功发放 ≥20 小时；被间隔挡住不占用当天机会。触发点在主进程内部，**不新增任何 renderer 可调用的发分命令**（防刷口径照 Mac 版）。
- **任务奖励**：Hub 收到 source 的 done 事件（真实完成）时 +3 分，kind=`task-reward`，以事件的会话/事件标识做 requestId 幂等。只认真实事件，不造数据。
- **饥饿值**：0–100，初始 80；随时间下降（每小时 −5，下限 0）；投喂按食物 restore 增加（上限 100）。数值与速率集中放模块常量，RESULT 里列表说明。
- **商店目录（21 种，照 Mac 版 food-catalog 定版数据）**：字段 id/名称/份数 portions/每份 restore/整包价 price/单位 unit：
  白米饭 rice 1/35/2/碗；清汤面 noodles 1/35/2/碗；大馒头 steamed-bun 1/35/2/份；吐司 toast 1/35/3/份；三明治 sandwich 1/35/3/份；鸡肉便当 chicken-bento 1/50/6/盒；兰州拉面 lanzhou-noodles 1/50/6/碗；蛋炒饭 fried-rice 1/50/6/份；韭菜盒子 chive-pie 1/50/6/份；韭菜鸡蛋水饺 chive-dumplings 1/50/6/盘；豪华便当 deluxe-bento 1/50/10/盒；小饼干 biscuit 3/10/1/小份；大白兔奶糖 milk-candy 3/10/1/小份；薯片 crisps 2/15/1/小份；水果拼盘 fruit 2/15/1/小份；小布丁 pudding 2/15/1/杯；巧克力 chocolate 2/15/1/小份；甜筒冰激凌 ice-cream 1/15/2/个；芝士蛋糕 cheesecake 1/15/3/份；牛奶 milk 2/10/2/盒；果汁 juice 2/10/2/盒。
  （字段序：portions/restore/price；价格买的是整包，投喂消耗一份、按每份 restore 回饥饿。）
- **商店/背包（控制页新页签「陪伴」）**：显示积分余额、饥饿值、今日已得陪伴分；商店列表可购买（余额不足禁用并提示）；背包列出已购食物与剩余份数，每项有「投喂」按钮。
- **投喂结算**：校验背包份数 → 扣 1 份 → 饥饿 += restore → 记账本流水（消耗 0 分，单独 kind=`feeding` 记录食物 id）→ 成功后才触发吃法动画（播放异常吞掉，不影响结算）；饥饿已满（100）时投喂拒绝并提示「已经吃饱啦」，不扣份。桌宠右键菜单加「投喂」子菜单（列背包里有份数的食物，点击同走一条结算路径）。

### 2. 吃法动画与角色包扩展
- 素材源：`~/workspace/ai-buddy-mac/resource-root/assets/pet-characters/claude/eat-{bowl,noodles,handheld,spoon,icecream,drink,candy}/`，每目录含 motion.webm（VP9-alpha，576×624，约 5 秒）+ static-0000.webp + static-0075.webp。这是用户自家生成的肖大大素材，授权随角色带入 PetLink 内测包；**只复制这 7 个目录的素材文件，不复制 fork 任何代码**。
- 角色包格式扩展：manifest 的 states 值保持帧序列格式不变；新增**可选**顶层 `clips` 字段：{clipId: {file:'eat-bowl/motion.webm', durationMs:5000, fallbackFrames:[...]}}。validateManifest 对 clips 做与 frames 同等的路径安全校验（不得指向角色包外）。旧角色包无 clips 必须照常工作。
- 桌宠播放：pet 窗收到主进程 `play-clip` 事件时，用 <video> 覆盖层播放对应 webm 一次（透明底），播完回到帧动画；webm 播放失败时降级按 fallbackFrames 帧序列播一轮。映射表（食物 id → clip）：照 Mac 版 EAT 简报：eat-bowl=rice/fried-rice/chicken-bento/deluxe-bento；eat-noodles=noodles/lanzhou-noodles；eat-handheld=steamed-bun/toast/sandwich/chive-pie/chive-dumplings/biscuit/crisps/chocolate；eat-spoon=pudding/cheesecake/fruit；eat-icecream=ice-cream；eat-drink=milk/juice；eat-candy=milk-candy；未知食物默认 eat-bowl。映射表放 packages/companion/ 内，两端（主进程判定 + pet 播放）只走这一份。
- 内测角色包 characters/xiaodada 补入 7 个 clip 目录与 manifest clips 登记。

### 3. 状态素材补齐与表情
- waiting/error/offline 三个状态目前各只有 1 帧占位。用仓库既有的角色帧生产办法（参考 M4 的 build-xiaodada.py 路径与其 RESULT 记录，素材源在 ~/workspace/ai-buddy-mac 的 claude 动作目录：waiting 用 waiting、error 用 fail、offline 用 sleep-loop、done 跳一下用 jump）给三个状态各补到 ≥24 帧的真动画；做不出真素材的状态在 RESULT 里明说并保留占位，不许拿静帧复制凑数冒充动画。
- 表情：Mac 版有 8 种表情图（emotion-* 目录）。PetLink 桌宠是逐帧 webp 渲染、无独立表情层；本期只做：把 8 张表情静帧作为「动作展示」页可预览的静态图列出（标注为表情），**不改桌宠渲染管线**。若发现低成本接入方式，先写进 RESULT 建议，不擅自扩范围。

### 4. 动作展示与概览（控制页）
- 新页签「动作」：列出当前角色全部 states 动作 + 7 个吃法 clip + 8 张表情，点击任意一项桌宠立即播放一次（走既有手动播放通道：states 用一次性状态覆盖，clips 用 play-clip；播放完自动恢复）。桌宠右键菜单加「动作展示」入口打开控制页到该页签。
- 现有「连接」页顶部加概览条：当前聚合状态、今日完成任务数（Hub 当日 done 事件计数）、陪伴积分余额、饥饿值、今日击键数（二期助手未到之前显示「—（打字跟随二期）」，不许显示假数字）。

### 5. 一期测试与打包
- 全量测试保持全绿；新增单测覆盖：账本幂等（同 requestId 不重复）、陪伴分每日一次+20 小时间隔（含被挡不占机会）、购买余额不足拒绝、投喂扣份/满腹拒绝/结算先行、食物→clip 映射全覆盖 21 种、clips 路径安全校验、旧角色包（无 clips）兼容。
- Linux Electron 冒烟：启动全绿；控制页「陪伴」页可买一份米饭并投喂成功（积分 2→0、背包份数变化、饥饿上升、pet 收到 play-clip）；动作页点击 eat-noodles 有播放事件。
- 用 scripts/package-win.mjs 出包 `PetLink-M6-Win-诊断版.zip`（顶层 PetLink-M6-Win/），RESULT 写明大小、sha256、核验摘要。
- 交付物：提交 + docs/M6_RESULT.md（实现对照表逐项对本简报、费率与常量表、冒烟结果、未验证项——Windows 实机未验必须明写）。

## 二期规格（本期不做，规格先定，防一期把路堵死）
1. **聊天窗**：控制页新增「聊天」页签 + 桌宠双击打开聊天小窗。设置页新增聊天配置：接口地址（OpenAI 兼容 chat/completions）、API Key（只存本机设置文件、日志与导出诊断里必须脱敏）、模型名、人设提示词（内置肖大大口吻默认文案，可改）。消息走主进程 fetch 转发，renderer 不直连。无配置时聊天页显示配置指引，不假装能聊。**不接肖大大本人的记忆/会话**（那是后续对接项）。
2. **打字跟随（Windows 原生小助手）**：独立小进程（优先免安装的轻量实现，方案在二期简报定），全局键盘事件**只计数、不记录按键内容**，节流后经本机 HTTP 上报 PetLink Hub 一个新 source `typing`（事件含时间段内击键数）；桌宠在她打字时呈现 working 跟随态与「跟随打字 · 工作中」徽章；概览「今日击键数」来自该 source 的当日累计。助手要能在托盘退出、无 PetLink 时静默。
3. **看向鼠标**：pet 渲染层按鼠标相对桌宠位置做 ≤±5px/±2° 的平滑变换（照 Mac 版行为规格，代码原创），仅在 idle 类状态生效，拖动/播放 clip 时不叠加。

## 红线
- 洁净重写：不复制 AI Buddy/fork 源码与官方素材；食物图标等图形素材缺失时用文字+emoji 占位并在 RESULT 列明，不许从 fork 扒官方图。
- 不编造数据：积分、击键、任务数只来自真实事件；占位必须显式标注。
- 不动五态协议与 Hub 既有 source 的语义；新增 typing source 属二期。
- 不把 Linux 冒烟/测试通过写成 Windows 可用。
