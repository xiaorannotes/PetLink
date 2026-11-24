# Codex 施工简报 M1：状态协议 + Hub 中枢

项目：PetLink（AI 状态桌宠商业版，洁净重写）。仓库：~/workspace/petlink
开工前必读：docs/DEV_DOC.md 第 0 节（洁净红线）、第 2 节（架构）、第 3 节（状态协议）、第 10 节（技术选型）、第 11 节（一期范围）、第 15 节（执行说明）。

## 红线

- 洁净重写：不得打开、参考或复制 ~/workspace/ai-buddy-mac 的任何代码/文案/素材。本模块全部原创实现。
- 零运行时依赖，只用 Node（>=20）标准库；ESM；所有用户可见文案用简体中文，代码标识用英文。

## 本模块交付物

1. `packages/protocol/`
   - 状态枚举与事件 schema 校验：实现 DEV_DOC 3.1/3.2 的字段与约束（v 必须为 1；source/session/state 必填且合法；ts 为毫秒数；project 只取 basename；title ≤40 字并过滤 token/key/password/密钥 等敏感词，命中则整条事件拒绝并给出原因码）。
   - 纯函数聚合器：输入会话表 → 输出全局聚合态，严格实现 3.3 的优先级（waiting > error > done > working > idle，offline 不参与）与 done 8 秒展示窗。
   - 单元测试（node --test）覆盖：合法/非法事件各字段、敏感词拒绝、优先级全序、done 窗口过期回落。

2. `packages/hub/`
   - HTTP 服务：只监听 127.0.0.1，默认端口 17321，被占用时顺延（17322…），启动后把 {port, pid, version} 写入数据目录的 hub.json（数据目录：环境变量 PETLINK_DATA_DIR 优先，否则按平台默认应用数据目录下 petlink/ 子目录）。
   - 鉴权：POST /v1/event 必须带 x-petlink-token；令牌从数据目录 token 文件读取，不存在则生成（32 字节随机，文件权限 600）。GET /v1/state 返回聚合态 + 会话明细（同样要令牌）。GET /healthz 不鉴权，只返回 ok 与版本。
   - 会话管理：按 (source, session) 建表；beat 只续命不改状态；陈旧规则按 3.3（working 90 秒无事件标 quiet、10 分钟降 idle；waiting 不降级）；最近 100 条事件环形日志（含被拒绝事件及原因码）。
   - 状态变化订阅：提供一个简单的 EventEmitter/回调出口（onAggregateChange），供后续表现层接入；本模块附带在演示脚本里用 console 打印验证即可。
   - 单元/集成测试：起真实服务发事件，验证鉴权失败 401、聚合优先级、陈旧降级（时间可注入或用短阈值参数加速测试，不得靠真睡 10 分钟）。

3. `scripts/demo-hub.mjs`
   - 启动 Hub → 依次模拟：claude-code 会话 working → waiting → done；第二个 codex 会话 working；打印每次聚合态变化与最终 /v1/state 快照 → 关闭服务退出。运行 `node scripts/demo-hub.mjs` 必须能一键跑通并输出清晰中文日志。

4. 根 package.json：workspaces 或等价组织方式任选，注明理由于交付说明；`npm test` 在根目录一条命令跑全部测试。

## 不做（本模块外）

适配器脚本、配置管理器、Electron 界面、通知器——都不要碰。

## 交付说明要求

完工时在 docs/M1_RESULT.md 写：文件清单、设计取舍（尤其数据目录与端口发现的实现）、测试结果（条数与全过截图式日志摘要）、演示脚本输出摘要、与规格不一致处（如有，先停工回报，不要静默改规格）。
