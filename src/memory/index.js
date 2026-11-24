import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_SCAN_DEPTH, DEFAULT_SCAN_FILES, assertSafeRoot } from './util/fs.js'
import { indexDocTool } from './tools/index-doc.js'
import { indexRepoTool, indexRepository } from './tools/index-repo.js'
import { queryMemoryTool } from './tools/query-memory.js'
import { rememberTool } from './tools/remember.js'
import { forgetTool } from './tools/forget.js'
import { watchRepoTool } from './tools/watch-repo.js'
import { statsTool } from './tools/stats.js'
import { WatchManager, applyWatchSettings } from './watch.js'
import { setupLazyIndexing } from './lazy.js'
import { initTypeScript } from './enhancer.js'
import { setupTaskbridge } from './setup/taskbridge.js'
import { listTasksTool, selectTaskTool, archiveTaskTool, showTaskPanelTool } from './tools/task-tools.js'
import { lessonTool } from './tools/lesson-tools.js'
import { installAutoInject } from './auto-inject.js'
import { installProjectMemoryService } from './project-memory-service.js'
import { rememberRoute } from './llm-route.js'
import { workflowCommandDefinition } from './commands/workflow.js'
import { setupSkill } from './skill.js'
import { flushDirtyStores } from './util/flush.js'
import { cfgValue, changedConfigKeys, asVolatile } from './util/config.js'

// 合并进 dsh-session-insight 后本模块**不是**独立插件行，只是被包根 index.js 调用的库：
// 导出 name / inject 会被 loader 当成第二个插件身份，且顶层 inject 会在缺 llm/tools
// 服务时让整个 host 半边不挂载（连成本统计一起死）。故只保留 Config 与 apply。
export const MEMORY_NAME = 'dsh-project-memory'

export const Config = Schema.object({
  memoryDir: Schema.string().default('.dsh-project-memory'),
  chunkChars: Schema.number().default(3000),
  maxChunksPerFile: Schema.number().default(40),
  // 单文件内存闸门，不是磁盘设置：索引一个文件要先整个物化，峰值随文件大小线性走。
  // 实测边际系数（峰值 RSS / 磁盘 MB，见 scripts/file-peak.mjs）：
  // 典型源码 ~10×、符号密集代码 ~22×、文本型 PDF ~20×；10 把单文件增量压在 ~+300 MB。
  maxFileSizeMb: Schema.number().default(10),
  maxOutputChars: Schema.number().default(8000),
  maxPdfPages: Schema.number().default(1000),
  llmQueryExpansion: asVolatile(Schema.boolean().default(false)),
  expansionCount: Schema.number().default(6),
  // 辅助 LLM 调用的路由覆写 —— **索引期零 LLM**，只服务召回期查询扩展与反思期。
  // 未设置时取当前会话 header 的 provider/model，后台路径取最近一次会话路由；都拿不到时
  // 走回退并记录 degraded（不静默）。
  llm: Schema.object({
    provider: Schema.string(),
    model: Schema.string(),
  }).default({}),
  // 以下三个键在设置面板的「记忆与笔记」页上可改（`settings.section`，见 client-memory-src/settings-section.js）。
  // `.volatile()` 是宿主设置页的准入条件：只有 volatile 字段能经 settings 接口写入，且写入后**不重启**
  // 插件、以 ref 形式原地更新。读取一律走 util/config.js 的 cfgValue()（ref 是对象，直接判真会读错）。
  //
  // 其余的键**刻意不标 volatile**：`lazyIndexing` / `watch` / `enableTypeScript` 关掉只会让记忆变旧，
  // 不属于"用户偏好"；它们仍可在 profile 里改，但不出现在卡片上（关掉监视等于放任索引过期）。
  lazyIndexing: Schema.boolean().default(true),
  autoIndexOnFirstUse: asVolatile(Schema.boolean().default(false)),
  watch: Schema.boolean().default(true),
  watchInterval: asVolatile(Schema.number().default(30)),
  // 危险根护栏：家目录 / 文件系统根 / 系统目录 / 包管理器前缀（/opt/homebrew …）整体扫描会吃满
  // 内存，默认一律拒绝。`roots.*` 是配置档级例外表；`allowUnsafeRoots` 只放开内置名单，deny/exclude 仍优先。
  allowUnsafeRoots: Schema.boolean().default(false),
  roots: Schema.object({
    // 即使在内置名单里也允许作根。精确匹配；文件系统根不在可放行之列。
    allow: Schema.array(Schema.string()).default([]),
    // 这个目录不能当根。精确匹配：子目录仍可各自成根。
    deny: Schema.array(Schema.string()).default([]),
    // 这棵子树里的文件一律不进索引（前缀匹配，含子目录）。
    exclude: Schema.array(Schema.string()).default([]),
  }).default({}),
  // 单次扫描上限。超过即截断（并跳过"删除本轮未见到条目"的清理，避免把没扫到的文件误删）。
  // **不可取消**：0 / 负数 / 非数值一律回落默认值（见 util/fs.js 的 scanLimits）。
  maxScanFiles: Schema.number().default(DEFAULT_SCAN_FILES),
  maxScanDepth: Schema.number().default(DEFAULT_SCAN_DEPTH),
  tsPath: Schema.string(),
  enableTypeScript: Schema.boolean().default(true),
  tasklist: Schema.object({
    enabled: Schema.boolean().default(true),
    // 任务成为会话绑定（select_task / /task switch）时，把任务步骤推成宿主 todo/write 快照
    syncHostOnAdopt: Schema.boolean().default(true),
  }).default({}),
  // 笔记检索（原 mcp__search-notes__search_notes，现由本插件的 `search_notes` 工具提供）。
  //
  // 为什么收进来：它和记忆引擎的文档层（通用 3000 字切块）覆盖同一批 Markdown，而它的
  // 质量高出一个量级 —— section 级 BM25F + 语义 RRF 融合 + 中文别名 + 相关性策略，实测
  // 同一个查询它给「网络/FRP.md L1 锚点名 + 原文行」，记忆引擎只给截断切块还混噪声。
  // 收进来之后 `indexDocs` 默认关掉，笔记语料只有一个真相源。
  //
  // `enabled` / `repo` / `timeoutMs` 标了 volatile：它们是「设置 → 记忆与笔记 →
  // 笔记检索」里的三个控件（client-memory-src/notes-settings.js 直接按
  // `['notes','repo']` 这样的**嵌套路径**写宿主设置，因为宿主的 SettingsFormModel
  // 只能寻址顶层键）。宿主校验「编辑路径的最近 volatile 祖先」（isVolatilePath），
  // 未标 volatile 的键写进去会被 400 拒绝。
  //
  // `python` / `warmup` 刻意不标：它们不是"用户偏好"，只在 profile 里改，改完重启生效。
  notes: Schema.object({
    enabled: asVolatile(Schema.boolean().default(true)),
    // 仓库根。空 = 不启用（host 半边不会拉起 python 进程，工具如实报未配置）。
    repo: asVolatile(Schema.string().default('')),
    // 解释器。空 = 自动：优先 <repo>/.notes/venv/bin/python（语义层依赖装在那里），
    // 退到 python3（只剩词面）。显式指定可指向别的 venv。
    python: Schema.string().default(''),
    // 单次检索超时。首查要加载模型（实测 1-6s），之后 200-400ms；留给冷启动的余量。
    timeoutMs: asVolatile(Schema.number().default(30000)),
    // 启动后预热一次（只 ping 进程，不加载模型）。
    warmup: Schema.boolean().default(true),
  }).default({}),
  // 语料索引层总闸：doc chunk + 代码符号。默认 **false**。
  //
  // 两个去处各归各的工具：代码结构归 codegraph（符号图 + 调用路径 + 影响面），笔记语料归
  // `notes` 那条路（section 级 BM25F + 语义 RRF）。插件自己再存一份，只会让 query_memory
  // 给出与两者都不一致的第三份答案，并把后台轮询与惰性索引的常驻成本摊在每个会话上。
  //
  // 关掉后受影响的面只有语料那半边：`index_repo` / `index_doc` / `watch_repo` 三个工具
  // 不注册、watch 不启动、惰性索引不挂、启动全量索引不跑、query_memory 只查 insight /
  // experience / task 三层、pm_stats 不报文件级统计。insights、任务、静默注入、反思管线
  // 与笔记检索全部不受影响。
  corpusEnabled: Schema.boolean().default(false),
  // 文档层子开关（仅在 `corpusEnabled` 打开时才有意义）。关掉后 `.md/.pdf/.txt` 不再进
  // 记忆库的 chunk 索引，代码符号层不受影响。
  indexDocs: Schema.boolean().default(false),
  // insight 实体：分层去重/强化/提升/容量/归档
  insight: Schema.object({
    dedupOverlap: Schema.number().default(0.7),
    reinforceBand: Schema.number().default(0.65),
    // 向量带（需 leanvec；未装自动退化成上面的纯词法带）。`0` = 关闭对应那条带
    // （不设 ≠ 0，默认值仍是 0.9 / 0.7）。
    autoMergeCos: Schema.number().default(0.9),
    autoMergeMargin: Schema.number().default(0.05),
    hintCos: Schema.number().default(0.7),
    maxForgetMatches: Schema.number().default(10),
    // `maxProject` / `maxGlobalProcedures` 标了 volatile：容量只在 profile 配置里调，
    // 写进去下一次 prune 就用新值，不需要重启（客户端仍按 `['insight','maxProject']`
    // 这样的嵌套路径读它，用来算设置页清单的容量占用）。
    // ⚠ volatile 字段在 `config` 上是 ref，`typeof x === 'number'` 会判假 —— 读取点必须走
    // cfgValue（见 util/config.js），否则改容量等于没改、且静默回落默认值。
    maxProject: asVolatile(Schema.number().default(100)),
    maxGlobalProcedures: asVolatile(Schema.number().default(200)),
    promoteConfidence: Schema.number().default(0.7),
    globalPromoteTasks: Schema.number().default(3),
    decayDays: Schema.number().default(90),
    globalFile: Schema.string(),
  }).default({}),
  // 反思管线（召回期可选 LLM 消费点，默认关）。产出只写 task 级草稿。
  reflection: Schema.object({
    enabled: Schema.boolean().default(false),
    cooldownMs: Schema.number().default(1800000),
    maxLessonsPerReflect: Schema.number().default(3),
    maxDecisionsPerReflect: Schema.number().default(2),
  }).default({}),
  // 静默注入（entry 常驻块 + relevance 门控）；无项目 root 可解析时零副作用。
  autoContext: Schema.object({
    enabled: Schema.boolean().default(true),
    entryOn: Schema.boolean().default(true),
    // 单轮注入预算（设置页「记忆规模」唯一一格）/ 常驻块条数（只在配置里）：volatile
    // 即时生效（读取点在 auto-inject.js 的 cfgEngine，必须走 cfgValue 解 ref）。
    maxTokens: asVolatile(Schema.number().default(400)),
    entryMaxInsights: asVolatile(Schema.number().default(6)),
    // 提示通道的相对阈值（层内最高分的比例）——出厂判据
    signalMinRatio: Schema.number().default(0.5),
    // resident 任务卡最多显示几个「编辑中」文件
    editedMax: Schema.number().default(3),
    // 记忆根是"推定"的（会话工作目录且无项目标记）时，首次注入前通告模型根在哪；只发一次、不占条目额度。
    rootNotice: Schema.boolean().default(true),
    // 模型自己维护清单且之后没有新人类消息时，不把任务卡回声给模型
    skipEchoSelfTodo: Schema.boolean().default(true),
    // ⚠️ 旧兼容闸门，**刻意不给默认值**：cfgEngine 以「是否为 number」选分支，有默认值就永远走
    // 旧的绝对 overlap 判据（长消息实测只有 0.014~0.057，必然过不了），signalMinRatio 变死代码；
    // 只有用户显式配置才保留旧行为。
    relevanceMin: Schema.number(),
    // 预算审计日志（stderr）**默认 off**：预算挤掉低优先级条目是正常降级、不是故障。
    // off（永不打印）/ once（每个会话最多一行）/ all（丢弃组合每变化一次一行，作者排查）
    budgetLog: Schema.union(['off', 'once', 'all']).default('off'),
    // 同一条 insight 重复注入的冷却（pre-step 步数）。0（默认）= 正文没变就不再注入（注入消息
    // 留在会话历史里，重发只是重复占位）；>0 用于外部裁剪历史的场景。
    reinjectItemsAfter: Schema.number().default(0),
    gateCooldownSteps: Schema.number().default(2),
    // 这两个是**保险丝**不是节流阀：节流由 gateCooldownSteps 与单轮 maxTokens 负责。
    // 实测旧默认 12 / 4000 时 11/81 个会话打满后永久静默；最长会话用 35 条 / 8640 字符，
    // 故抬到 60 / 24000。显式配小值可复现旧行为。
    maxItemsPerSession: asVolatile(Schema.number().default(60)),
    maxItemCharsPerSession: asVolatile(Schema.number().default(24000)),
    // 主题门控四档（设置页「按主题注入」下拉 + cfgEngine 的 topicGate）：
    //   weak（默认）= 提示通道 + 万能 op（file-write / shell-run / git-commit）命中的 trigger；
    //   hint = 只提示通道；all = 精确条件也挡；off = 不门控。
    // 只有**显式** `category` 的条目参与门控：没分类的条目行为完全不变。
    topicGate: asVolatile(Schema.union(['weak', 'hint', 'all', 'off']).default('weak')),
    hintMinCoverage: Schema.number().default(0.45),
    hintMinMatched: Schema.number().default(2),
    hintMinSupport: Schema.number().default(0.15),
    // 可选向量层（leanvec）：**不装就是纯词法**，装了也只改经验/洞察层的**排序**，闸门与返回
    // 条数不变，doc/symbol 层不受影响。`vectorDir` 刻意**不给默认值**（否则"是否启用"永远为真）。
    // 解析顺序：本项显式路径 > DSH_LEANVEC_DIR > 可选依赖 `leanvec`；目录需有 dist/leanvec.f32
    // 与 tokenizer.json。**填 `off` 可强制关闭**（连模型都不加载）。
    vectorDir: Schema.string(),
    // 融合权重 (1-α)·BM25归一 + α·余弦。实测小 k 上 α=0.5 最优（k=3 64% vs 58%、k=5 69% vs 67%），
    // 而 α=1（纯向量）明显更差（hit@10 53% vs 81%）。`0` = 关掉重排（连模型都不加载）；
    // 它**只**管重排，写入侧去重看 `vectorDedup`。
    vectorAlpha: Schema.number().default(0.5),
    // 写入侧近重复检测（0.9 自动覆盖 / 0.7 近邻提示）的独立开关。默认开；关掉只影响写入，不影响召回排序。
    vectorDedup: Schema.boolean().default(true),
    // ⚠ 两个**实验性**旋钮：没有可发布的默认值，所以不设就不启用（不设 ≠ 0）。
    //   itemMin  —— 提示通道的条目级余弦地板；speakMin —— 通道级"语义救援"阈值。
    // 分辨力结论见 src/auto-inject.js 的 scoreHints 注释（**证据不足**），留作真实数据上复现 A/B。
    vectorItemMin: Schema.number(),
    vectorSpeakMin: Schema.number(),
    // legacy `trigger.scope` 的处置。默认 **ignore**：值由作者手写，几乎不可能落在自动派生的
    // 项目画像 tag 空间里，当收窄条件只会判死条目。显式配 'filter' 可恢复旧语义。
    legacyScope: Schema.union(['filter', 'ignore']).default('ignore'),
    auditLog: Schema.boolean().default(true),
    auditMaxBytes: Schema.number().default(262144),
    // 影子记录（admission-shadow.jsonl）：**每步**一行，含全部候选的判据特征与场景。主审计只在
    // 真的注入时写，静默步零痕迹 → 无法离线重放"换个阈值会怎样"。只写盘、不进 prompt、不花 token，
    // 所以默认开。轮转只留 `.1` 一代，单项目日志硬上限是 `2 × shadowMaxBytes + 2 × auditMaxBytes`。
    shadowLog: Schema.boolean().default(true),
    shadowMaxBytes: Schema.number().default(524288),
  }).default({}),
})

/**
 * 9 个工具的唯一定义处：apply 与 schema 预算测试共用，避免测试里手抄一份列表
 *（新增工具不会因为漏抄而绕过预算）。
 *
 * 语料层关掉（`corpusEnabled: false`，默认）时，三个索引类工具**不注册**：留一个
 * "调用即报错"的工具只会让模型反复试错，工具表里压根没有才是对的答案。
 * @param {object} config 插件配置
 * @param {object} ctx 宿主上下文（仅部分工具构造时需要）
 * @param {object} watchManager watch 管理器
 * @returns {object[]} defineTool 的产物
 */
export function toolDefinitions(config, ctx, watchManager) {
  const corpusOn = cfgValue(config, 'corpusEnabled') === true
  return [
    listTasksTool(config),
    selectTaskTool(config, { llm: ctx?.llm, ctx }),
    archiveTaskTool(config, { llm: ctx?.llm, ctx }),
    showTaskPanelTool(config),
    ...(corpusOn
      ? [indexDocTool(ctx, config), indexRepoTool(ctx, config), watchRepoTool(watchManager, config)]
      : []),
    queryMemoryTool(ctx, config),
    rememberTool(config),
    forgetTool(config),
    lessonTool(config),
    statsTool(config),
  ]
}

/**
 * 逐个注册工具，单个失败只丢那一个。
 *
 * 触发这次改动的是真事故：`dsh-memory-tiers` 也注册了 `memory_stats`，宿主 `ctx.tools.register`
 * 遇到重名直接抛错，而这里原本是裸循环——一个工具名被别的插件占掉，整条 fiber 就 failed，
 * 12 个工具连同客户端面板、`/tasks` 一起消失，用户看到的是"插件装了但什么都没生效"。
 * 重名不是本插件的 bug，代价不该是全部归零；失败必须点名打日志，否则只是换成"少了个工具"
 * 的静默。其它注册错误（schema 不合法等）同样吞掉并照常登记其余工具——那种 bug 归测试管，
 * 线上仍应尽量保留可用面。
 *
 * @param {object} ctx 宿主上下文（读取 `ctx.tools.register`）
 * @param {object[]} defs `toolDefinitions()` 的产物
 * @returns {string[]} 注册失败的工具名，供调用方/测试核对
 */
export function registerTools(ctx, defs) {
  const failed = []
  // `tools` 由包根 index.js 的顶层 `inject` 声明（见那里的注释）。这里保留守卫是为了
  // 精简宿主（无 tools 服务）不刷屏；但**必须走 ctx.logger**，不能再 console.warn ——
  // 2026-11-23 的故障里正是这条 warn 只进了进程 stderr、没进 dsh 日志，导致
  // "插件明明加载了、工具却全没了"排查了很久。
  if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
    const message = '[dsh-project-memory] tools service unavailable; memory tools not registered'
    if (typeof ctx?.logger?.error === 'function') ctx.logger.error(message)
    else console.error(message)
    return defs.map((def) => def.name)
  }
  for (const def of defs) {
    try {
      ctx.tools.register(def)
    } catch (err) {
      failed.push(def.name)
      console.error(`[dsh-project-memory] tool "${def.name}" was not registered: ${err?.message ?? err}`)
    }
  }
  return failed
}

export function apply(ctx, config) {
  if (config.enableTypeScript !== false) {
    initTypeScript(config)
  }

  // 语料层总闸：默认关（见 Config 里 `corpusEnabled` 的注释）。关掉时整条索引链路不接线 ——
  // 没有轮询器、没有惰性索引、没有启动全量扫描，工具表里也没有那三个索引工具。
  const corpusOn = cfgValue(config, 'corpusEnabled') === true
  const watchManager = new WatchManager(ctx, config)
  // watchInterval 是 volatile 字段：设置页改完要当场生效（重排定时器），而不是等下次启动。
  // watch 本身不提供界面开关（关掉监视等于放任索引过期），但仍可在 profile 里设 false。
  // 持久化的根清单只恢复一次；先关后开时补一次（否则"打开监视"要等到下次启动才真的开始轮询）。
  let watchRestored = false
  const syncWatch = () => {
    if (!corpusOn) return false
    if (cfgValue(config, 'watch') !== false && !watchRestored) {
      watchRestored = true
      watchManager.restorePersisted()
    }
    return applyWatchSettings(watchManager, config)
  }
  ctx.effect(() => {
    syncWatch()
    return () => watchManager.stop()
  })

  if (corpusOn && config.lazyIndexing) {
    setupLazyIndexing(ctx, config, watchManager)
  }

  // 设置页保存（宿主 volatile 更新）后：只有 watchInterval 会影响运行中的定时器，
  // 其余 volatile 字段都在各自的读取点当场生效（llmQueryExpansion 每次查询读、autoIndexOnFirstUse 只认启动值）。
  // paths 为 `[[]]` 时表示整份 Config 都可能变了 → changedConfigKeys 返回 null，按"全部重读"处理。
  ctx.on('loader/volatile-update', (paths) => {
    const changed = changedConfigKeys(paths)
    if (changed === null || changed.has('watchInterval')) syncWatch()
  })

  // 卸载/退出前把还脏着的 store 同步写一次（后台重试只是兜底，不能当正确性保证）。
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => flushDirtyStores({ timeoutMs: 1500 }))
  }
  // TaskBridge：任务实体 + 宿主 todo 同步
  setupTaskbridge(ctx, config)
  // 用法本身也是记忆的一部分：注册成宿主 skill（可选依赖，没有 skills 服务就静默跳过）。
  setupSkill(ctx)
  // 跟踪会话路由（request/header 事件），为无会话上下文的召回期可选 LLM（查询扩展 / 反思）兜底
  ctx.on('session/event', (session, event) => {
    if (event?.type === 'request/header') rememberRoute(session)
    // 会话活跃信号：跑回合时把 watch 轮询压到最低，回合结束立刻补扫一次（见 watch.js）。
    // 语料层关掉时没有轮询器，这条信号没有接收方。
    if (!corpusOn) return
    const key = session?.id ?? 'unknown'
    if (event?.type === 'turn/start' || event?.type === 'step/start') watchManager.setSessionActive(key, true)
    else if (event?.type === 'turn/end') watchManager.setSessionActive(key, false)
  })
  // 会话被销毁时也要摘掉活跃标记，否则没有正常 turn/end 的会话会把轮询**永久**压在兜底节拍。
  ctx.on('session/disposed', (session) => {
    if (!corpusOn) return
    watchManager.setSessionActive(session?.id ?? 'unknown', false)
  })
  registerTools(ctx, toolDefinitions(config, ctx, watchManager))

  // /tasks：唯一的用户命令（宿主命令注册后必然出现在 `/` 菜单且无法隐藏，所以只留一条）；
  // 切换/归档/审核等子动词由面板按钮经 remote.commands.execute 驱动。
  try {
    ctx.inject(['commands'], (commandsCtx) => {
      commandsCtx.commands.register(workflowCommandDefinition(config, ctx))
    })
  } catch (err) {
    console.error(`[dsh-project-memory] /tasks registration skipped: ${err.message}`)
  }


  // 原生服务 seam（D3-1）：宿主/其他插件可通过 `ctx.get('projectMemory')` 消费召回与写入。
  // 老宿主没有 `ctx.provide` 时 install 返回 null 并安全跳过，不影响其余注册与 apply 的返回值。
  installProjectMemoryService(ctx, config)

  // 注册 agent/pre-step 监听，向每步请求追加记忆消息（默认开；异常/无会话 cwd → 交回默认决策）。
  installAutoInject(ctx, config)

  // 启动时全量索引是**一次性**动作：设置页把它打开只影响下一次启动，不会当场扫全树
  // （卡片上的说明也这么写）。所以这里读的是本次启动时的值，不订阅后续变化。
  // 它属于语料层：总闸关掉时连判断都不做。
  if (corpusOn && cfgValue(config, 'autoIndexOnFirstUse')) {
    // effect 回调必须同步并返回 disposer；异步体独立执行，用 cancelled 标志避免卸载后再写日志
    ctx.effect(() => {
      let cancelled = false
      const run = async () => {
        const root = process.cwd()
        // 全量索引 cwd 是显式开启的行为，但"cwd 是家目录"几乎总是误用：拒绝并说明，
        // 而不是替用户扫全树。这里走与工具调用同一个 assertSafeRoot：allow / deny / exclude 全生效。
        try {
          assertSafeRoot(root, { config })
        } catch (err) {
          if (!cancelled) console.error(`[dsh-project-memory] autoIndexOnFirstUse skipped: ${err.message}`)
          return
        }
        try {
          watchManager.addRoot(root)
          const report = await indexRepository(ctx, config, root, { allowUnsafe: config.allowUnsafeRoots === true })
          if (!cancelled) console.log(`[dsh-project-memory] ${report}`)
        } catch (err) {
          if (!cancelled) console.error(`[dsh-project-memory] auto-index failed for ${root}: ${err.message}`)
        }
      }
      run()
      return () => {
        cancelled = true
      }
    })
  }
}