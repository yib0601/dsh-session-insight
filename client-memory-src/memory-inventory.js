/**
 * 「记忆清单」的纯逻辑层：载荷 → 行 + 占用统计（零 React 依赖，可单测）。
 *
 * 数据来源与任务面板的记忆视图**同一条**通道：`/tasks insight list <scope> <offset> <limit>`
 * （见 paging.js 的 insightListLine / memory-load.js 的 parseInsightPayloadText）。这里不新增
 * 第二条读取路径 —— 设置页只是把同一份记忆库以"能不能看见"的方式摆出来。
 *
 * 为什么要单独一层
 * ───────────────
 * 设置页只需要三件事：每条长什么样、这一层占了多少、容量还有多远。把它们写在组件里，
 * 「容量该用哪个配置键」「归档条目算不算占用」这类判断就只能靠读 JSX 猜；抽出来之后
 * 每条判据都能被测试钉住（test/memory-inventory.test.js）。
 *
 * 载荷字段（宿主 src/memory/commands/insight-actions.js 的 insSummary）：
 *   id / scope / kind / title / body / draft / archived / confidence / hitCount /
 *   members / files / symbols / updatedAt /（task 层附加）taskId / taskTitle
 */

/**
 * 清单页签的顺序：**项目层在前**。设置页是"我这个项目的记忆"的入口，任务层草稿与全局层
 * 是旁支（前者等模型确认，后者跨项目），放前面会让人以为记忆主要长在临时层里。
 */
export const MEMORY_SCOPES = ['project', 'task', 'global']

/**
 * 作用域 → 控制它的容量配置字段。
 *
 * 任务层没有容量（草稿挂在各自任务上，随任务归档），返回 `null` —— 界面上就不画进度条，
 * 而不是画一条永远 0% 的假容量。
 */
const CAPACITY_FIELD = {
  project: 'maxProject',
  global: 'maxGlobalProcedures',
  task: null,
}

/**
 * 某一层的容量来自哪个配置字段。
 * @param {string} scope - `project` | `task` | `global`。
 * @returns {string|null} `maxProject` / `maxGlobalProcedures`；任务层为 null。
 */
export function scopeCapacityField(scope) {
  return Object.hasOwn(CAPACITY_FIELD, scope) ? CAPACITY_FIELD[scope] : null
}

/**
 * 单次读取的行数。
 *
 * 设置页是"总览 + 抽查"，不是全量编辑器（那是任务面板的记忆视图）：一屏 40 条足够看清
 * 最近学了什么，也避免每次打开设置都拉几百条 JSON 进内存。宿主侧仍有 `total`，占用统计
 * 因此不受这个窗口影响。
 */
export const INVENTORY_PAGE_SIZE = 40

/** 非空字符串数组：去空白、丢非字符串、保持原顺序（路径/符号的次序有意义）。 */
function stringList(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (text !== '' && !out.includes(text)) out.push(text)
  }
  return out
}

/** 非负整数计数；脏值一律归 0（界面上「-1 个文件」只会让人怀疑数据坏了）。 */
function countOf(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** 正文型字段：空串与纯空白视为"没有"，返回 null 好在渲染时直接跳过。 */
function textOf(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * 触发条件归一化。
 *
 * 决策条目的 `trigger.when` 是它**唯一真正生效**的那部分（写哪些文件、跑哪类动作、
 * 命中哪些意图词），老字段 `keywords` / `scope` 仍在用。三者都空 → 返回 null，
 * 渲染层据此不画一个空标题块。
 * @param {any} value - 载荷的 `trigger`。
 * @returns {{keywords: string[], scope: string[], when: object|null}|null} 归一化触发条件。
 */
export function normalizeTrigger(value) {
  if (!value || typeof value !== 'object') return null
  const when = value.when && typeof value.when === 'object' ? value.when : null
  const guard = when && when.guard && typeof when.guard === 'object' ? when.guard : null
  const normalized = {
    keywords: stringList(value.keywords),
    scope: stringList(value.scope),
    when: when === null ? null : {
      writes: stringList(when.writes),
      ops: stringList(when.ops),
      intents: stringList(when.intents),
      paths: stringList(when.paths),
      hosts: stringList(when.hosts),
      guard: guard === null ? null : {
        paths: stringList(guard.paths),
        notPaths: stringList(guard.not_paths ?? guard.notPaths),
        tags: stringList(guard.tags),
      },
    },
  }
  const hasWhen = normalized.when !== null && (
    normalized.when.writes.length > 0 || normalized.when.ops.length > 0
    || normalized.when.intents.length > 0 || normalized.when.paths.length > 0
    || normalized.when.hosts.length > 0 || normalized.when.guard !== null
  )
  if (normalized.keywords.length === 0 && normalized.scope.length === 0 && !hasWhen) return null
  return normalized
}

/**
 * 宿主载荷的字段 → 归一化行。
 *
 * 归一化只做两件事：**别让脏数据把界面弄坏**（负命中、坏时间、非字符串路径），
 * 以及**别丢掉详情**。第二点是这条链路曾经的缺口：`files` / `symbols` 在宿主载荷里
 * 带了两份（总数 + 清单），旧版本只把动作用到的几个字段搬过来，于是设置页只能写
 * 「文件 3」，用户点不开也看不到是哪三个文件 —— 数据一直在，是渲染层拿不到。
 *
 * @param {object} raw - 载荷里的单条。
 * @returns {object} 归一化行（形状由 test/memory-inventory.test.js 钉住）。
 */
export function normalizeInventoryRow(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: typeof item.id === 'string' ? item.id : '',
    kind: typeof item.kind === 'string' && item.kind !== '' ? item.kind : 'lesson',
    title: typeof item.title === 'string' ? item.title : '',
    body: typeof item.body === 'string' ? item.body : '',
    draft: item.draft === true,
    archived: item.archived === true,
    confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : null,
    // 负命中数没有语义（脏数据/旧格式），归一成 0：界面上写「-1 次命中」只会让人怀疑数据坏了。
    hitCount: typeof item.hitCount === 'number' && Number.isFinite(item.hitCount) && item.hitCount > 0 ? item.hitCount : 0,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    taskTitle: typeof item.taskTitle === 'string' && item.taskTitle !== '' ? item.taskTitle : null,
    // 详情面：涉及的文件/符号（清单 + 总数）、合并过几个任务、触发条件、步骤与各 kind 的正文。
    files: countOf(item.files),
    fileList: stringList(item.fileList),
    symbols: countOf(item.symbols),
    symbolList: stringList(item.symbolList),
    members: countOf(item.members),
    trigger: normalizeTrigger(item.trigger),
    steps: stringList(item.steps),
    problem: textOf(item.problem),
    choice: textOf(item.choice),
    reason: textOf(item.reason),
    fix: textOf(item.fix),
    solution: textOf(item.solution),
    pattern: textOf(item.pattern),
  }
}


/**
 * 一批载荷行归一化，丢掉没有 id 的脏条目（没有 id 就没有稳定 key，渲染会互相顶替）。
 * @param {ReadonlyArray<object>} items - 载荷 items。
 * @returns {Array<object>} 可用行。
 */
export function inventoryRows(items) {
  if (!Array.isArray(items)) return []
  const rows = []
  const seen = new Set()
  for (const item of items) {
    const row = normalizeInventoryRow(item)
    if (row.id === '' || seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }
  return rows
}

/**
 * 一层的占用统计。
 *
 * `used` 取载荷的 `total`（含归档）：写入侧 prune 判的就是**含归档**的条数（超限先删归档），
 * 用"只算活跃"的数字会让进度条永远差一截，看起来像容量没生效。归档/草稿另行单列，供用户判断
 * "这一层里有多少是还没确认的、多少是软删的"。
 * @param {{items?: ReadonlyArray<object>, total?: number, capacity?: number|null}} input -
 *   载荷行、宿主报的总条数、该层容量（任务层为 null）。
 * @returns {{used: number, capacity: number|null, ratio: number|null, archived: number,
 *   drafts: number, shown: number}} 统计结果；`ratio` 为 null 表示没有容量概念。
 */
export function summarizeInventory(input) {
  const rows = inventoryRows(input?.items)
  const total = typeof input?.total === 'number' && Number.isFinite(input.total) && input.total >= 0
    ? input.total
    : rows.length
  const capacity = typeof input?.capacity === 'number' && Number.isFinite(input.capacity) && input.capacity > 0
    ? input.capacity
    : null
  // 已用量以宿主的 total 为准，但永不小于本次实际拿到的行数（载荷缺 total 时不至于显示 0）。
  const used = Math.max(total, rows.length)
  return {
    used,
    capacity,
    ratio: capacity === null ? null : Math.min(1, used / capacity),
    archived: rows.filter((row) => row.archived).length,
    drafts: rows.filter((row) => row.draft && !row.archived).length,
    shown: rows.length,
  }
}

/**
 * 注入量估算载荷（`/tasks insight estimate`）→ 一行可读的三段数字。
 *
 * 为什么不自己算：宿主那个数字是用**真引擎**（cfgEngine + buildInjection）跑出来的，与下一步
 * 实际注入同源；客户端再算一遍就会有两份公式，早晚分叉。
 *
 * 三个数各回答一个问题：
 *  - `limitChars`：这一轮最多能注入多少（硬上限，含常驻卡）；
 *  - `poolChars`：这个项目的活跃记忆正文一共多长（全命中时的理论上限，回答"记忆有多大"）；
 *  - `chars`：按当前话题/绑定任务算出来的**本步**注入（0 = 这一步不会注入任何东西）。
 * @param {any} payload - 宿主载荷。
 * @returns {{chars: number, limitChars: number, estTokens: number, percent: number|null,
 *   entryChars: number, itemChars: number, items: number, dropped: number, poolChars: number,
 *   poolItems: number, total: number, topicGate: string|null, root: string|null}|null}
 */
export function injectSummary(payload) {
  if (!payload || typeof payload !== 'object') return null
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const chars = num(payload.chars)
  const limitChars = num(payload.limitChars)
  return {
    chars,
    limitChars,
    // token 折算跟上下文用量面同一口径（4 字符 ≈ 1 token），否则两个界面会给出互相矛盾的数字。
    estTokens: Math.ceil(chars / 4),
    percent: limitChars > 0 ? Math.round(Math.min(1, chars / limitChars) * 100) : null,
    entryChars: num(payload.entryChars),
    itemChars: num(payload.itemChars),
    items: num(payload.items),
    dropped: num(payload.dropped),
    poolChars: num(payload.poolChars),
    poolItems: num(payload.poolItems),
    total: num(payload.total),
    topicGate: typeof payload.topicGate === 'string' ? payload.topicGate : null,
    root: typeof payload.root === 'string' ? payload.root : null,
  }
}

/**
 * 把比例变成整数百分比（进度条宽度与文案共用，避免两处各自取整给出矛盾数字）。
 * @param {number|null} ratio - 0..1；null 表示没有容量。
 * @returns {number|null} 0..100 的整数；无容量时 null。
 */
export function usagePercent(ratio) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100)
}

/** 清单的初始状态（组件与测试共用的空形状）。 */
export function emptyInventory() {
  return { scope: 'project', rows: [], total: 0, nextOffset: null, loading: false, error: null, loaded: false }
}
