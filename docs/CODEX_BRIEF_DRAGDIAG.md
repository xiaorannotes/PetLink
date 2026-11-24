# 拖动诊断简报：Windows 实机仍拖不动——全链埋点 + app-region 优先重做

## 病情（截至 2026-11-11 14:01）
- 用户实机（企业微信旁截图为证）：修复版包（`360aed9e…`，含 DRAGFIX `14f3663`）桌宠**依然拖不动**，且截图显示**跟随光影阴影**（原生图片拖拽的残影半透明预览）——说明在他的 Windows 上，拖拽仍被原生层接管。
- Linux 冒烟里 DRAGFIX 的两个根因（img 原生拖拽抢事件、分数 DPI 相对定位漂移）均已实测修复、三档缩放误差 0；但冒烟用 CDP Input.dispatchMouseEvent 注入，属合成事件；Windows 真实鼠标走 OS 的 OLE 拖放路径，两者不等价。**Linux 绿 ≠ Windows 好**，这条已被实机证伪，不许再用冒烟绿作任何修复结论。
- M5 时期用户还报过：右键菜单、摸摸反馈在实机的表现从未被逐项确认过；本轮把「pet 页指针事件到底有没有活着」一并测清。

## 本轮交付形态：一个「拖动诊断版」包，两件事并行
### A. 主拖法重做（不依赖日志，先把最稳的路铺上）
- pet 窗主体（main 元素，含 img 与气泡之外的全部区域）加 `-webkit-app-region: drag`，由操作系统原生移窗，不走 JS 事件链——这是无边框桌宠在 Windows 上最稳的拖法。
- 必须保留的交互用 `no-drag` 抠出并逐项验证：img 上的点击＝摸摸（pointerup 未移动时）、双击＝打开聊天、右键＝菜单（contextmenu 在 drag 区域上是否触发，Windows 与 Linux 都要实测写进 RESULT；若 drag 区域吞掉右键，改为气泡区 no-drag 承接右键、或主进程监听 pet 窗右键的系统方案，实现自选但要有实测）。
- 动效冲突处理：看向鼠标的 transform（translate/rotate）作用在 img 上，与 app-region drag 不应互相干扰；拖动期间 OS 接管窗口，renderer 无事件属正常，松手后 snapshot/位置持久化（pet.on('moved')）必须仍工作。
- 旧的 JS pointer 拖动链**保留为第二层**（img 区域 no-drag 时仍走它），两条路互不删除；DRAGFIX 的 absolute 定位与 draggable=false 保留。
### B. 全链埋点诊断（下次回传 boot.log 一次定位）
pet 页与主进程各关键点写节流日志到 boot.log，前缀 `[drag]`，单次启动最多记 60 行拖动相关（计数器截断，不许刷盘）：
- pet 页：pointerdown（记 target 是 img/main/bubble、screenX/Y）、pointermove 每第 20 次计数一行、pointerup/pointercancel/dragstart 各一行、contextmenu 一行、dblclick 一行；
- 主进程：收到 'move' 命令每第 20 次计数一行（记 mode 与最终 setPosition 的坐标）、'menu' 与 'chat-open' 命令各一行；
- 启动行追加一段环境：`screen.getAllDisplays()` 的 scaleFactor 列表、`pet.getBounds()` 初始值——用户机器真实缩放一次看清。
日志走既有 bootLog 通道（同步追加那套），不新建文件；计数与样本规则写进 RESULT。

## 验证（Linux 侧，照实标注边界）
- smoke-drag 扩展：断言 app-region CSS 存在（main 计算样式 -webkit-app-region === 'drag'、img/bubble 的 no-drag 设置）；CDP 合成拖动继续断言 JS 链位移误差 ≤8（保证第二层没改坏）；新增 contextmenu→'menu' 命令到达、dblclick→'chat-open' 到达的断言（此前无此覆盖）。
- 埋点冒烟：跑一次合成拖动后断言 boot.log 出现 `[drag]` 的 pointerdown 行与 move 行。
- 既有 150 测试＋smoke-m6/m5-1/m6p2 全绿。
- RESULT 必须明说：app-region 的 Windows 原生拖动与右键行为**无法在 Linux 验证**，本包是「新主拖法 + 诊断埋点」的实机验证版，不是已修复宣称。

## 交付
- 新包覆盖仓库根目录 `PetLink-M6-Win-诊断版.zip`（包内使用说明加一节「拖不动时：拖完把 exe 旁 boot.log 发回」），RESULT 写 sha256/大小；不往仓库外拷。
- 提交 + docs/DRAGDIAG_RESULT.md：A 的实现与右键/双击实测结论、B 的埋点清单与样本规则、冒烟结果、未验证项（Windows 全项照实列）。
