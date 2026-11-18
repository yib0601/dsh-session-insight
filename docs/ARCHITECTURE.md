# Turn cost — module contract

## Boundary (three sentences)

- **负责什么**: 用官方单价把 DSH 已算好的 token 用量换算成钱（逐轮徽章 + 底部会话累计），并提供 `dsh-context` 的上下文洞察界面（跨会话仪表盘、会话「上下文」页签、`/context` 命令弹窗、右侧栏 Context 页签、费用偏好设置行），已完全替代该插件。
- **不负责什么**: 不改写会话日志、不 append 任何 Session 事件、不改动其他插件的 UI、不使用任何第三方价格（models.dev、pi-ai catalog 等）；不统计联网搜索/OCR 等按次计费项；不拉取 models.dev 或 npm 注册表；不读取原始会话日志文件；不持久化聊天正文（上下文浏览器的「请求内容」只渲染页面已在内存里的聊天快照，关页即消失）。
- **对外只暴露什么**: `conversation.chat.assistant-actions`（`turn-cost`）、`conversation.chat.turnTail`（`dsh-turn-cost`）、`conversation.composer.dock`（`session-cost`）、`conversation.view`（`tc-context` / `tc-fleet`）、`conversation.input.overlay`（`tc-context-modal`）、`sidebar.footer.action` / `sidebar.right.pane.tab`（`tc-overview` / `tc-context`）、`settings.section` + `settings.section.icon`（`turn-cost`，插件自有设置页）、`inputTriggers` 命令源 `context`（`/context`），以及两个 locale 命名空间 `turnCost` / `tcContext`。三个 `tc*` session 投影为内部数据源。

## Modules

| module | files | responsibility | deps |
|---|---|---|---|
| `pricing` (internal, pure) | `client.js` §1 (`OFFICIAL`, `FREE_MODELS`, `lookupPrice`, `computeTurnCost`, `isPeak`, `computeSessionTotal`, `computeRequestsTotal`) | 官方价目表 + 纯函数算价；零 DSH 依赖、可单独测试 | 无 |
| `preferences` (internal) | `client.js` §1.5 (`prefs`, `usePrefs`, `PREF_DEFAULTS`, `normalizeBudget`) | 本地偏好 store：逐轮徽章 / 底部累计显隐、金额币种（CNY 默认 / USD）、DeepSeek 计费时段、会话预算（0 = 关）；`localStorage` 持久化，`useSyncExternalStore` 兼容 | 无 |
| `presentation` (internal) | `client.js` §2 (`TurnCostBadge`, `SessionCostPill`, `useMessageTurn`, `useTurnTailOf`) | 逐轮徽章（动作行内联 / 无动作行时独占一行，明细按 token 桶给金额）+ 底部状态栏会话累计药丸（有预算时显示 花费/预算 与进度条，超支转红） | React（宿主模块表）、`react-dom`、locale `t` |
| `composition` | `client.js` §3 (`apply`) | 注册 `assistant-actions` / `turnTail` / `composer.dock` 槽位条目、locale，并异步加载 context chunk | `ctx.slots`, `ctx.locale`, `ctx.effect` |
| `context-host` | `index.js`, `host/schema.js`, `host/fold.js`, `host/projections.js` | 3 个 `tc*` session 投影（timeline / headers / activity）；timeline 额外折叠工具调用计数、命令执行流水（程序名 / 状态 / 墙钟耗时）、文件操作流水与逐文件行数增减、用户 / 助手消息 / 技能加载计数，并记录模型切换事件；activity 按请求时间把 token 桶分进 `peakBuckets` / `offPeakBuckets` 并按模型再分一层；`ctx.inject(['sessionProjections'])` 延迟激活，纯 Node + 防御式 | `ctx.sessionProjections` |
| `context-client` (lazy chunk) | `client.context.js` | 5 个界面入口 + 设计系统（宿主 `--dsw-*` token）+ 卡片与仪表盘：KPI 磁贴、上下文统计（轮次 / 步骤 / 用户输入 / 助手消息 / 技能加载 / 工具调用 + 工具与程序分布）、构成 / Token（环形图）/ 费用构成 / 趋势（可切指标）/ 按模型花费 / 时序 / 文件活动（类型筛选·路径搜索·行数增减·操作日志）/ 命令执行（程序筛选·状态筛选·搜索）/ 事件（类型筛选）/ Agent / 逐请求浏览器（筛选·排序·CSV·分页·请求内容展开）+ 编队页（家族网络 / 协作时间线 / 家族事件），仪表盘含 7 日双指标图（带数值标签）、周对齐热力图、模型花费榜与可搜索分页会话卡片；跨会话聚合 `useMemo` 缓存，历史金额按 Host 折叠的 `peak` / `offPeak` 桶分档计价 | `react`, `react-dom`, `pricing` face |

依赖方向：`composition → presentation → pricing`、`presentation → preferences`（单向，无反向/循环）；`context-client → pricing`（经显式传入的只读 face），`context-client → 内置/自建投影`（只读）。所有 Client 代码分布在 `client.js` 与其懒加载 sibling chunk `client.context.js`（Host 的 `require.async` 协议）；`client.js` 约 1200 行、`client.context.js` 约 1480 行，Host 侧按文件分模块。

**项目级边界例外（单文件 400 行红线）**：`dsh.client` 静态包由 Host 以 `client.js` 入口产物服务，跨文件同步 `require` 不可靠（chunk 只能异步 `require.async`），因此入口内 `pricing` / `presentation` / `composition` 必须共用一个文件。该文件按 § 分区划分职责，`pricing` 段零 DSH 依赖并被 `test/pricing.test.js` 独立抽取测试；四个职责段无共享可变状态、无反向依赖。此例外只放宽「单文件行数」，不放宽低耦合/高内聚/单向依赖等其余红线。Host 侧与 lazy chunk 已按职责拆成独立文件。

## Data contract (inbound, read-only)

`PropsRuntime<'conversation.chat.turnTail'>` 中的 `turn: TurnLocation`：

```
turn.turn: number
turn.data.get('turn-tail') -> {
  time: number,                 // turn/end 事件时间 (ms epoch)
  tokenUsage?: {
    uncachedInputTokens: number,
    outputTokens: number,
    totalTokens: number,
    cacheReadTokens?: number,
    cacheWriteTokens?: number,
    reasoningTokens?: number,    // outputTokens 的子集，不重复计价
    routes?: [{ provider: string, model: string }]
  }
}
```

`PropsRuntime<'conversation.chat.assistant-actions'>` 只给 `messageId: MessageId`。内联席位由两条只读查表补出同一个 payload：`ChatSnapshot.nodes` 里 `kind === 'assistant-step'` 且 `data.finalNode.messageId === messageId` 的节点给出该 Turn 号，再用 `kind === 'turn-tail'` 且 `data.turn === 轮号` 的节点取上面的 `turn-tail`（`tokenUsage` / `time` / `closing`）。两个 selector 都返回 Map 里的稳定引用或原始值，不会引起 `useSyncExternalStore` 抖动。`closing === null`（模型没产出最终回复、动作行不存在）时内联席位不渲染，改由 `turnTail` 席位把同一枚徽章放在该轮末尾。

用量由 DSH 自带 `deriveTurnTokenUsage()` 从持久会话日志精确折叠（含重试/失败 attempt），本模块不重算。

`tcTimeline` 的读模型（`stateVersion` 7，全部是计数与元数据，不含任何工具输出正文）：

```
tcTimeline -> {
  requests: [{ seq, time, turn, step, provider, model, input, cacheRead, cacheWrite, output, totalTokens }],
  events:   [{ seq, time, kind, turn, step, label, tokens }],      // kind: compact|prune|inject|switch|mode
  files:    { [path]: { reads, writes, searches, added, removed, last } },
  fileOps:  [{ seq, time, turn, step, path, kind, added, removed }],   // kind: read|write|search
  commands: [{ seq, time, turn, step, callId, program, call, status, durationMs }],  // running|ok|error
  toolCalls:{ [toolName]: count },
  counts:   { user, answers, skills },
  last:     <最新一条 request>,
}
```

`commands[].program` 由 Host 从命令行首 token 提取（跳过 `sudo` / `env` / `FOO=1` / `cd <dir> &&` 这类包装与路径前缀）；`call` 只保留首行且截断到 96 字符。`commands` / `fileOps` 分别封顶 400 条、`toolCalls` 封顶 24 个工具名，超出丢最旧。

`tcActivity` 的落盘形状（投影内部数据，`stateVersion` 3）：

```
tcActivity.days['YYYY-MM-DD'] -> {
  tokens, requests,
  buckets: { input, cacheRead, cacheWrite, output },        // 当天合计
  peakBuckets: {...}, offPeakBuckets: {...},                // 按请求时间分档
  byModel: { [model]: { peak: {...}, offPeak: {...} } }     // 模型 × 分档
}
```

分档必须在 Host 折叠，而不是在 Client 现算：按天聚合之后请求时间已经不存在，Client 只能拿「现在」判档，等于把整段历史按打开面板的时刻重新定价（DeepSeek 两档差一倍）。`host/schema.js#isPeakBeijing` 与 `client.js#isPeak` 是同一规则的 Host / Client 两份实现（一个跑在 Node、一个跑在浏览器 window module，无法共用模块），节假日常量 `BEIJING_HOLIDAYS` / `HOLIDAYS_UTC8` 需要同时改。

## Price contract

- 单位：USD / 1M tokens（记账单位）；四个桶 `input` / `cacheRead` / `cacheWrite` / `output`。显示币种由偏好决定：CNY 时优先用厂商官方人民币行，缺省则按 `USD_TO_CNY` 折算并标 `fx`。
- DeepSeek 有高峰/空闲两档（北京时区工作日 09:00–12:00、14:00–18:00 为高峰，空闲价 = 高峰价一半）；每轮按 `turn-tail.time` 判档。中国法定节假日无法通用判定，默认按工作日规则，`HOLIDAYS_UTC8` 可补。
- 一轮出现多个 `routes` 且解析到**不同价格行**时无法把聚合用量按模型拆分：按首个路由计价并标 `≈`；同名价格行（网关别名）不算混合。
- 逐轮徽章优先用 `computeTurnRequestsTotal`（`tcTimeline` 该轮的请求行逐笔计价），与会话药丸同源；该轮请求行不足（1200 条上限截断）时回退到 `turn-tail` 聚合并标 `≈`。
- 仪表盘只能看 `tcActivity`（按天聚合、无请求时间），因此按 `peakBuckets` / `offPeakBuckets` 分别计价；把偏好里的计费时段钉成高峰 / 空闲时，整表统一按该档算，与逐请求视图一致。
- 价格表未收录的模型返回 `unknown`，显示「价格未知」而不是 `0`；不会把「免费额度」与「未知」混淆。
- 每桶金额只由「桶数量 × 该桶显示币种单价」得出（`computeTurnCost` 的 `parts` 与 `displayRates`），徽章明细、Token 统计与费用构成三处共用，不另起一套算法。
- 预算只是显示层的软上限：不参与计价、不落 Host 配置，超支只改颜色与文案。
- 价格来源与抓取日期写在 `docs/PRICING.md` 与每个价格条的 `source` 字段里。

## Delivery checklist

- [x] 写明「负责 / 不负责 / 公开接口」
- [x] 无跨模块 `internal/` 引用（单 bundle 内按 § 分区，见上方项目级例外）
- [x] 无反向依赖、无循环依赖
- [x] 单模块对外依赖未增加（只依赖宿主已有的 `slots`（含 `settings.section` / `settings.section.icon`）/`locale`/`react`/`react-dom`/`inputTriggers`/`sidebarRightTabs`，以及浏览器 `localStorage`）
- [x] `pricing` 与 `context-host` 为纯函数，可在 Node 中独立测试（`test/pricing.test.js`、`test/host-fold.test.js`）
- [x] `docs/ARCHITECTURE.md` 与 `contracts/modules.yaml` 已同步
- [x] 改动前跑过 `codegraph_explore`（该 npm 安装无 `.codegraph` 索引，按规则回退 grep/read）

## Replication status (goal: fully replace dsh-context)

`dsh-context` 未安装在该 profile 中，用户可见入口已归位到它的原名：命令 `/context`、页面「上下文」、仪表盘「上下文洞察」；只有内部 slot id / 投影 key 保留 `tc*` 前缀，避免将来共存时撞车。

**已交付**

- Host：三个 `tc*` 投影（真实 fold + 单测），`ctx.inject(['sessionProjections'])` 延迟激活 —— 直接 `ctx.get` 会在插件先于 projection 服务加载时拿到 `undefined`，导致所有上下文卡片永久为空。activity 投影把每笔请求按时间分进 `peak` / `offPeak` 桶（含模型维度），仪表盘的历史金额因此不随「现在几点」漂移。
- 五个界面入口：侧栏脚「上下文洞察」按钮 + portal 仪表盘、会话「上下文」页签、`/context` 命令弹窗、右侧栏 Context 页签、设置 → 费用（插件自有设置页）。。右上主视图的「上下文」页签与右侧栏 Context 页签是同一份视图的两个挂载点，消息动作行不再重复提供跳转按钮。
- 九张卡片 + 仪表盘：KPI、当前上下文构成、Token 统计、时序统计、费用（官方价）、上下文趋势、文件活动（含 `apply_patch` 补丁内路径）、Agent 网络、上下文事件、上下文浏览器（逐请求可展开 token 桶 / 缓存命中 / 计费时段）、近 7 日用量与费用、活跃热力图、会话卡片。
- 费用：会话累计改为读 Host 请求日志逐请求精确计价（模型 + 高峰/空闲档），只有日志被截断时才按比例补齐并标 `≈`。
- 偏好：逐轮徽章显隐、底部会话累计显隐、金额币种（人民币 / 美元）、DeepSeek 计费时段（自动 / 高峰 / 空闲）、会话预算，存 `localStorage`。
- v1.3 视觉与功能：宿主 token 设计系统（KPI 磁贴、卡片头、堆叠条、面积 sparkline、chip、开关与分段控件）；费用按桶与按模型拆分；趋势可切 Tokens / 费用 / 缓存命中；逐请求浏览器支持筛选、排序与 CSV 导出；仪表盘热力图按周对齐、会话可搜索排序、新增跨会话模型花费榜；设置页分组并新增预算行；修掉深色主题下分段控件白底白字（`--dsw-alias-brand-primary` 在深色里是近白色）。
- v1.4 准确性与可用性：仪表盘按「每笔请求当时的计费时段」计价（Host 折叠出 `peak` / `offPeak` 桶，历史金额不再受打开面板的时刻影响）；仪表盘聚合走 `useMemo`，搜索框打字不再重算全历史；上下文浏览器与会话卡改为每页 60 条 +「显示更多」，长会话（1200 条请求）不再被截断；近 7 日柱图带数值标签；「会话」磁贴改报已折叠出用量的会话数并附总数；模型切换真正记入上下文事件（此前 `request/context` / `model/selection` 被提前 return，`switch` 分支永远不会命中）。
- v1.5 卡片补齐（对齐 dsh-context 的能力面）：新增「上下文统计」卡（轮次 / 步骤 / 用户输入 / 助手消息 / 技能加载 / 工具调用 + 工具调用分布 + 命令程序分布）、「命令执行」卡（程序 chip 筛选 + 状态筛选 + 搜索 + 墙钟耗时与状态）；文件活动升级为类型筛选 / 路径搜索 / 逐文件 `+added / −removed` / 可展开操作日志；Token 统计加环形图；上下文事件加类型筛选 chip。全部数据来自 Host 折叠的计数与元数据（不含工具输出正文），`tcTimeline` 升至 `stateVersion 7`。
- v1.6 对齐面收官：① 上下文浏览器展开「请求内容」（用户消息 / 思考 / 回答 / 工具调用参数 / 工具结果，默认 300 字预览）；② 新增**编队**页签（家族成员、各自费用、协作时间线、家族事件）；③ 仪表盘加时间范围（今天 / 7 / 30 天）与工具 / 程序 / 技能三张跨会话排行；④ Host 的 `tcActivity` 增每日名称计数（`stateVersion 4`），旧世代 Host 下三张排行卡显示「需重启」提示而不是空数据。

**实现注意（部署形态）**：Client chunk 按 rev 重新加载，Host 的 JS 是每个进程一份模块世代；就地改 `host/*.js` 后，正在运行的 Host 仍执行旧折叠代码，直到 DSH 重启（或该 bundle 重新加载一次）。因此 `commands[].program` 在 Client 侧做了兜底重算：Host 存的值若是包装根（`cd` / `sudo` / `env` …）就用 `call` 文本重新提取，避免就地升级后程序分布一直显示 `cd`。

**仍缺（不影响替代）**：DeepSeek 账户余额（需要 Host 侧调用官方余额接口，属另一条网关联通问题）、除中英以外的语言包（DSH 其余 6 种语言会回落到英文）、编队页里的**协作任务**（任务板数据不在本插件读模型内，现在只有一行说明）。
