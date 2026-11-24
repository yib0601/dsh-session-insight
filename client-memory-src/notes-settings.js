/**
 * 「笔记检索」三个可写字段（目录 / 启用 / 超时）。
 *
 * 为什么不用宿主导出的 `SettingsFormModel`
 * ─────────────────────────────────────
 * 它把每个字段当**顶层键**：读的是 `value[field]`、写的是 `{op:'set', path:[field]}`。
 * 而笔记配置在 Config 里是 `notes` 的子键，宿主校验写路径时看的是"最近 volatile 祖先"
 * （`isVolatilePath`），`['notes.repo']` 这种单段字符串既匹配不到 schema，写进去还会被
 * 设置接口拒掉。宿主真正的写口是 `configForm.mutate(ops, revision)`，ops 的 path 是
 * **数组**，所以这里直接按 `['notes','repo']` 读写（实现见 nested-form.js）。
 *
 * 为什么值得为它单写一份
 * ─────────────────────
 * 笔记目录是这套插件里唯一"不填就等于整个世界看不见"的配置：不填 → 常驻桥不拉 →
 * `search_notes` 报未配置。把它藏进 profile 的 yml，等于要求用户先知道它存在。
 * 这份表单的全部目的就是让它在插件详情页上可见、可改、改完立即生效（volatile）。
 *
 * 形状与宿主表单保持一致（`shell()` / `field()` / `actions()`），`settings-section.js`
 * 才能把几份表单的状态合成一个保存按钮；刻意不依赖任何宿主模块，纯函数 + 订阅。
 */
import { NestedSettingsForm } from './nested-form.js'

/** 三个字段的配置路径。数组形状由宿主设置接口的 ops 协议决定。 */
const PATHS = {
  repo: ['notes', 'repo'],
  enabled: ['notes', 'enabled'],
  timeoutMs: ['notes', 'timeoutMs'],
}

/**
 * 快照里读不到该键时显示什么（宿主没提供这个命名空间时兜住渲染）。
 *
 * 正常的取值一律走快照的 `value`（= 当前生效值），这张表不是第二份默认配置。
 */
const FALLBACK = { repo: '', enabled: true, timeoutMs: 30000 }

/** 超时下限：低于 1 秒连冷启动的进程 ready 都等不到。 */
const MIN_TIMEOUT_MS = 1000

const SPECS = {
  repo: {
    section: 'notes',
    fallback: FALLBACK.repo,
    read: (value) => (typeof value === 'string' ? value : ''),
    // 空文本 = 清掉 profile 里的覆盖值（回到默认空 = 不启用），而不是写一个空字符串。
    parse: (text) => {
      const trimmed = text.trim()
      return trimmed === ''
        ? { op: 'unset', path: PATHS.repo }
        : { op: 'set', path: PATHS.repo, value: trimmed }
    },
  },
  enabled: {
    section: 'notes',
    fallback: FALLBACK.enabled,
    read: (value) => (value === false ? 'false' : 'true'),
    parse: (text) => text === 'true'
      ? { op: 'set', path: PATHS.enabled, value: true }
      : text === 'false'
        ? { op: 'set', path: PATHS.enabled, value: false }
        : undefined,
  },
  timeoutMs: {
    section: 'notes',
    fallback: FALLBACK.timeoutMs,
    read: (value) => (Number.isFinite(value) ? String(value) : ''),
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { op: 'unset', path: PATHS.timeoutMs }
      const value = Number(trimmed)
      return Number.isFinite(value) && value >= MIN_TIMEOUT_MS
        ? { op: 'set', path: PATHS.timeoutMs, value }
        : undefined
    },
  },
}

/** 表单里出现的字段名，顺序即渲染顺序。 */
export const NOTES_FIELDS = ['repo', 'enabled', 'timeoutMs']

export class NotesSettingsForm extends NestedSettingsForm {
  constructor(scope) {
    super(scope, {
      fields: NOTES_FIELDS,
      specs: SPECS,
      // action 名沿用既有契约（settings-section.js 的 `inject()` 按名字透传）。
      actions: { edit: 'editNotes', save: 'saveNotes', discard: 'discardNotes' },
    })
  }
}
