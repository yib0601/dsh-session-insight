/**
 * 「记忆规模」表单：七个可写字段，界面上只画一格（单轮注入预算）。
 *
 * 这份表单回答的是「记忆库能长多大、每轮最多塞进多少」：项目层与全局层的容量、单轮注入
 * 预算、常驻块条数、每会话的条数/字符保险丝、主题门控。它们全是 Config 里的嵌套键
 * （`insight.maxProject` / `autoContext.maxTokens`），写入走宿主设置接口的数组 path
 * （实现见 nested-form.js）。**哪些上界面**由 `MEMORY_SCALE_VISIBLE_FIELDS` 定，不是在这里删字段。
 *
 * 为什么字段不跟着界面一起砍
 * ─────────────────────────────────
 * 摘掉字段就等于摘掉快照里的投影：设置页清单的容量占用（`maxProject`）、注入量估算的
 * 预算（`maxTokens` × 3 字符）都读这些生效值，断了就退化成"没有容量 / 没有上限"。
 * 只改渲染是唯一既保住读通道、又只留一个旋钮的做法。
 *
 * 为什么只剩一格、而不是把 Config 全摊开
 * ─────────────────────────────────
 * 其余键分两类，都不该出现在"规模"里：
 *  - 阈值/权重（`dedupOverlap`、`signalMinRatio`、`hintMinCoverage`…）——调它们改的是判据
 *    质量，默认值是实测标定的，摆到界面上只会被随手改坏；
 *  - 只在启动期生效的（`watch`、`corpusEnabled`、`lazyIndexing`）——它们不是 volatile，
 *    改了要重启，与"保存后立即生效"的卡片语义冲突。
 *
 * 各字段的语义（与宿主实现一一对应）
 *  - `maxProject`：项目层 insight 条数上限，超了先删归档条目（`pruneItems`）；
 *  - `maxGlobalProcedures`：全局层上限，提升(path to global)只增不减，不收口就形同虚设；
 *  - `maxTokens`：单轮注入的字符预算（引擎按 ≈token 折算），挤掉的条目记 `budget` 丢弃 ——
 *    界面上唯一那一格；
 *  - `entryMaxInsights`：常驻任务卡里最多带几条洞察；
 *  - `maxItemsPerSession` / `maxItemCharsPerSession`：**保险丝**，不是节流阀——打到上限
 *    后本会话永久静默，所以默认值给得偏大（60 条 / 24000 字符）；
 *  - `topicGate`：四档主题门控，默认 `weak`。
 */
import { NestedSettingsForm } from './nested-form.js'

/** 字段 → 配置路径。数组形状由宿主设置接口的 ops 协议决定。 */
const PATHS = {
  maxProject: ['insight', 'maxProject'],
  maxGlobalProcedures: ['insight', 'maxGlobalProcedures'],
  maxTokens: ['autoContext', 'maxTokens'],
  entryMaxInsights: ['autoContext', 'entryMaxInsights'],
  maxItemsPerSession: ['autoContext', 'maxItemsPerSession'],
  maxItemCharsPerSession: ['autoContext', 'maxItemCharsPerSession'],
  topicGate: ['autoContext', 'topicGate'],
}

/**
 * 快照里读不到该键时显示什么。与 Config 的 `default(...)` 同值，但**不是**第二份默认配置：
 * 能读到快照时永远以快照为准。
 */
const FALLBACK = {
  maxProject: 100,
  maxGlobalProcedures: 200,
  maxTokens: 400,
  entryMaxInsights: 6,
  maxItemsPerSession: 60,
  maxItemCharsPerSession: 24000,
  topicGate: 'weak',
}

/**
 * 输入框的取值区间（`min` / `max` 同时给 `<input>` 与校验用）。
 *
 * 下限不是装饰：`maxProject: 0` 会让写入侧每一次 prune 都清空项目层；`maxTokens: 0` 会让
 * 注入通道彻底失声。下限 1 表示"至少还留得住一条"，真正想关掉请用开关而不是 0。
 *
 * 单位是**配置单位**（`maxTokens` 是 token 数）。界面上那一格按字符收，换算见
 * `BUDGET_CHARS_PER_TOKEN` 与 `MEMORY_SCALE_WIDGET`。
 */
export const MEMORY_SCALE_LIMITS = Object.freeze({
  maxProject: { min: 1, max: 5000, step: 10, unit: 'items' },
  maxGlobalProcedures: { min: 1, max: 5000, step: 10, unit: 'items' },
  maxTokens: { min: 50, max: 8000, step: 50, unit: 'tokens' },
  entryMaxInsights: { min: 0, max: 50, step: 1, unit: 'items' },
  maxItemsPerSession: { min: 0, max: 1000, step: 5, unit: 'items' },
  maxItemCharsPerSession: { min: 0, max: 200000, step: 1000, unit: 'chars' },
})

/**
 * 预算的显示单位换算：引擎的硬上限是 `maxTokens × 3` **字符**
 * （`src/memory/auto-inject.js` 的 `stepBudget`，常驻任务卡与条目共享这一份）。
 *
 * 所以设置页那一格直接**按字符收**：用户看到 2700，注入时就是 2700 字的上限，不再出现
 * 「预算写 900 token、明细却显示约 675 token」那种两把尺子。写回时 ÷3 折成 token 数——
 * 配置键仍是 `maxTokens`，宿主读它做 ×3，换算只发生在这一层。
 */
export const BUDGET_CHARS_PER_TOKEN = 3

/** 一个数字字段的 spec：范围为闭合区间、必须整数。 */
function intSpec(key, section) {
  const limit = MEMORY_SCALE_LIMITS[key]
  return {
    section,
    fallback: FALLBACK[key],
    read: (value) => (Number.isFinite(value) ? String(value) : ''),
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { op: 'unset', path: PATHS[key] }
      const value = Number(trimmed)
      if (!Number.isFinite(value)) return undefined
      const rounded = Math.round(value)
      if (rounded < limit.min || rounded > limit.max) return undefined
      return { op: 'set', path: PATHS[key], value: rounded }
    },
  }
}

/**
 * 预算的 spec：界面收字符，配置存 token。
 *
 * 取整按 3 的倍数就近（`Math.round(chars / 3)`）：宿主那边只有整 token，界面把结果再
 * ×3 显示回来，所以 `1000` 字符保存后会显示 `999` —— 这是换算的必然，hint 里说了。
 * 校验仍在 token 域做（`MEMORY_SCALE_LIMITS.maxTokens`），别把它挪到字符域：那会让
 * 「150 字符」这种输入静默落到 50 token 之下。
 */
function budgetSpec(section) {
  const limit = MEMORY_SCALE_LIMITS.maxTokens
  return {
    section,
    fallback: FALLBACK.maxTokens,
    read: (value) => (Number.isFinite(value) ? String(value * BUDGET_CHARS_PER_TOKEN) : ''),
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { op: 'unset', path: PATHS.maxTokens }
      const chars = Number(trimmed)
      if (!Number.isFinite(chars)) return undefined
      const tokens = Math.round(chars / BUDGET_CHARS_PER_TOKEN)
      if (tokens < limit.min || tokens > limit.max) return undefined
      return { op: 'set', path: PATHS.maxTokens, value: tokens }
    },
  }
}

/**
 * 主题门控的四档（与 `src/memory/auto-inject.js` 的 `cfgEngine` 一一对应）：
 * `weak` = 提示通道 + 万能 op（file-write / shell-run / git-commit）命中；`hint` = 只提示通道；
 * `all` = 精确条件也挡；`off` = 不门控。值必须是这四个字符串之一，宿主不接受布尔。
 */
export const TOPIC_GATE_VALUES = ['weak', 'hint', 'all', 'off']

/** 一个枚举字段的 spec：渲染成 <select>，解析时只认白名单。 */
function enumSpec(key, section, options) {
  return {
    section,
    fallback: FALLBACK[key],
    kind: 'select',
    options,
    read: (value) => (typeof value === 'string' && options.includes(value) ? value : FALLBACK[key]),
    parse: (text) => {
      const value = String(text ?? '').trim()
      if (!options.includes(value)) return undefined
      return { op: 'set', path: PATHS[key], value }
    },
  }
}

const SPECS = {
  maxProject: intSpec('maxProject', 'insight'),
  maxGlobalProcedures: intSpec('maxGlobalProcedures', 'insight'),
  maxTokens: budgetSpec('autoContext'),
  entryMaxInsights: intSpec('entryMaxInsights', 'autoContext'),
  maxItemsPerSession: intSpec('maxItemsPerSession', 'autoContext'),
  maxItemCharsPerSession: intSpec('maxItemCharsPerSession', 'autoContext'),
  topicGate: enumSpec('topicGate', 'autoContext', TOPIC_GATE_VALUES),
}

/** 表单里的数字字段名，顺序即表单顺序（容量 → 预算 → 保险丝）；渲染取子集，见下。 */
export const MEMORY_SCALE_FIELDS = [
  'maxProject',
  'maxGlobalProcedures',
  'maxTokens',
  'entryMaxInsights',
  'maxItemsPerSession',
  'maxItemCharsPerSession',
]

/**
 * 不按数字渲染的字段（下拉）。单独一张表是因为它们不参与 `MEMORY_SCALE_LIMITS`
 * （没有 min/max/step），渲染成 `<select>`；当前没有一格在界面上（见下方可见表）。
 */
export const MEMORY_ENUM_FIELDS = ['topicGate']

/** 表单里出现的全部字段（数字在前、枚举在后）。 */
export const MEMORY_SCALE_ALL_FIELDS = [...MEMORY_SCALE_FIELDS, ...MEMORY_ENUM_FIELDS]

/**
 * 界面上真正渲染的那几格：只有「单轮注入预算」。
 *
 * 判断标准是「谁能被随手调坏」：注入预算是每轮都要看、看一个数字就够的量；其余六项
 * （两层容量、常驻条数、两个保险丝、主题门控）是写入侧与降级路径的参数，默认值是实测
 * 标定的，摆在设置页只会被当成待办逐格调一遍。它们仍留在表单里 —— 不是留着好看：
 *   - 记忆清单的容量占用（「已存 N 条 · 容量 M 条（P%）」）取 `maxProject` 的**生效值**，
 *     字段从表单摘掉，快照里那个键就没有投影，用量条会退化成「已存 N 条」；
 *   - 主题门控的当前档位也要被读着（改配置后这一页跟着变），只是不画下拉。
 * 想改这些值：写进 profile 配置即可，与在本页保存走同一条宿主校验 + revision fence。
 */
export const MEMORY_SCALE_VISIBLE_FIELDS = Object.freeze(['maxTokens'])

/**
 * 输入框的渲染区间（**显示单位**）。`min/max/step/unit` 都是界面上那个单位的数值。
 *
 * 只有预算不是 1:1：界面按字符（= 引擎的硬上限），配置存 token。校验仍走
 * `MEMORY_SCALE_LIMITS`（配置单位），这里只负责把 `<input>` 的框画对。
 */
const DISPLAY_SCALE = { maxTokens: BUDGET_CHARS_PER_TOKEN }

export const MEMORY_SCALE_WIDGET = Object.freeze(Object.fromEntries(
  MEMORY_SCALE_FIELDS.map((key) => {
    const limit = MEMORY_SCALE_LIMITS[key]
    const scale = DISPLAY_SCALE[key] ?? 1
    return [key, {
      min: limit.min * scale,
      max: limit.max * scale,
      step: limit.step * scale,
      unit: scale === 1 ? limit.unit : 'chars',
    }]
  }),
))

export class MemoryScaleForm extends NestedSettingsForm {
  constructor(scope) {
    super(scope, {
      fields: MEMORY_SCALE_ALL_FIELDS,
      specs: SPECS,
      actions: { edit: 'editScale', save: 'saveScale', discard: 'discardScale' },
    })
  }
}
