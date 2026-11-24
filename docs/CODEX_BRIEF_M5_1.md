# M5.1 简报：启动失败时的界面滞留修复（用户实机反馈）

## 背景（必读）
M5 诊断包在用户自己的 Windows 电脑上**启动成功**（M4 无声消失问题已越过），但出现三个实机症状，本简报只修这三个，不做其他改动：

1. **中央英文页挪不动**：用户看到的是控制窗口停在 boot.html（标题 “PetLink is starting”），且窗口留在屏幕中央。根因已在代码中定位：`boot()` 末尾 `if(bootProgress.every(s=>s.status==='success'))` 才把控制窗从 boot.html 切到 control.html 并在未 onboard 时 showControl/focus；任一 stage 失败时控制窗**永久停在 boot 页**。boot 页是英文的原因：Electron 未打包运行时界面语言回退 en-US，boot.html 内联脚本用的是 `{running:'进行中',...}[s?.status]` 这类普通对象字面量下标——注意：这不是本简报要深挖的点，boot 页文案本来就是中文（labels 与状态词均为中文），实机显示英文 “PetLink is starting” 说明**用户看到的可能根本不是这份 boot.html 的渲染结果，而是别的东西**；无论如何，本简报的修复方向是：失败时不把用户单独留在诊断页，而是进一个能操作的中文界面，并把失败信息显著展示（见任务 1）。不要在本简报里追查语言回退的根因。
2. **桌宠拖不动**：pet 窗的拖动依赖 pet.mjs 中 img 的 pointerdown→'move' IPC 链。若启动未完全成功，pet 页可能停在顶层 `await window.petlink.call('snapshot')` 未返回的状态（pet.mjs 第 7 行：`window.petlink.subscribe(update);update(await window.petlink.call('snapshot'));`——snapshot() 在 hub/character 就绪前返回 bootSnapshot，其 `character:null`，update() 里读 `s.character.manifest` 会抛错，后续 tick/拖动监听虽然已注册在模块后段，但顶层 await 抛错会中断模块执行，**pointerdown 等监听在抛错点之后注册的部分可能未执行**——实际上监听注册在第 15 行之后，顶层 await 在第 7 行先行，await 抛错将使整个模块失败，监听一条都不会注册）。结论：pet 页对 booting 占位 snapshot 必须健壮（见任务 2）。
3. **打字没反应**：同症状 2 的连带——页面脚本死了，自然无任何交互。本简报不新增「打字聊天」功能（产品本就没有），只保证现有交互（拖动、点击摸头、右键菜单）在降级状态下不死。

现状代码事实（已核对）：
- `bootSnapshot()`（boot.mjs）返回 `character:null`、`sessions:[]`、无 `aggregate` 字段；pet.mjs 的 update() 无条件读 `s.aggregate.quiet`、`s.character.manifest.*`、`s.sessions.map(...)`——占位结构喂给它必然抛 TypeError。
- main.mjs 中 pet 窗创建 stage 的前置条件只看 `builtIn.ok && service.ok`，不看其他 stage（数据目录、读设置、用户角色、通知、托盘）成败；且 pet 窗一律 `alwaysOnTop` 按 settings（默认 true）。
- boot.html 无任何按钮，用户在失败态下无路可走（关窗后 window-all-closed 被忽略，进程靠托盘存活，用户更找不到出口）。

## 任务

1. **失败不滞留诊断页**：`boot()` 结束后无论是否有 stage 失败，控制窗都切换到 control.html。失败信息这样呈现：在 control.html 顶部加一条醒目的中文横幅区域（默认隐藏），主进程切换页面后通过既有 snapshot/boot-progress 通道把失败 stage 的 label 与 error 原文传给页面渲染（可用一次性 IPC 事件 `boot-report`，preload 里加对应订阅即可）。横幅文案示例：「启动未完全成功：加载用户角色失败（…原文…）。其余功能可正常使用；如需排查，请把程序目录下的 boot.log 发回。」页面其余功能与版式不改。
2. **pet 页健壮化**：
   - main.mjs 的 `snapshot()`：在 hub 或角色未就绪时，返回的占位结构必须能被 pet.mjs 与 control.mjs 安全消费——补齐 `aggregate:{state:'idle',quiet:false}` 与一个安全的 character 占位（二选一：返回内置角色 manifest 的最小可用结构，或让 pet.mjs 在 character 为空时只显示默认静态帧与默认台词）。以改动最小、两边都不抛错为准，RESULT 里写明选了哪条。
   - pet.mjs 的 update() 对缺字段做防御（aggregate/character/sessions 任一缺失时降级渲染而不是抛错）；顶层 await 的 snapshot 调用加 catch，失败时用本地默认数据继续，**保证拖动/点击/右键监听在任何情况下都注册执行**。
3. **pet 窗创建条件收紧**：pet 窗只在「内置角色成功 且 服务成功 且 数据目录成功」时创建；任一不满足则跳过 pet 窗与托盘里依赖 pet 的菜单项（托盘本身可建，但「显示/隐藏桌宠」项在无 pet 时禁用或不出现），控制页横幅说明桌宠未启动的原因。启动全部成功时的现有行为（位置恢复、置顶、托盘）保持不变。
4. **测试与打包**：
   - 全量测试保持全绿；为占位 snapshot 的完整性（pet.mjs/control.mjs 消费所需字段齐全）与 stage 失败后仍切 control.html 的编排逻辑补单元测试（可抽纯函数测）。
   - Linux Electron 冒烟复跑两条路径：正常路径全绿走完；人为制造用户角色损坏的失败路径，确认控制窗切到 control.html 且横幅出现、进程不死。
   - 用既有 scripts/package-win.mjs 重新出包：`PetLink-M5.1-Win-诊断版.zip`（顶层文件夹 PetLink-M5.1-Win/），RESULT 写明大小与核验摘要。
5. **交付物**：代码提交；docs/M5_1_RESULT.md（改了什么、测试原文摘要、双路径冒烟结果、zip 路径/大小、未验证项如实列出——Windows 实机仍以用户复测为准）。

## 红线
- 不动五态协议、Hub、适配器、设置校验、IPC 命令语义。
- 不新增聊天/打字功能；不追查界面语言回退根因（超出本简报）。
- 不把 Linux 冒烟通过写成 Windows 已修好。
