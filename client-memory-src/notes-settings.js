/**
 * 「笔记检索」三个可写字段（目录 / 启用 / 超时）。
 *
 * 为什么不用宿主导出的 `SettingsFormModel`
 * ─────────────────────────────────────
 * 它把每个字段当**顶层键**：读的是 `value[field]`、写的是 `{op:'set', path:[field]}`。
 * 而笔记配置在 Config 里是 `notes` 的子键，宿主校验写路径时看的是"最近 volatile 祖先"
 * （`isVolatilePath`），`['notes.repo']` 这种单段字符串既匹配不到 schema，写进去还会被
 * 设置接口拒掉。宿主真正的写口是 `configForm.mutate(ops, revision)`，ops 的 path 是
 * **数组**，所以这里直接按 `['notes','repo']` 读写。
 *
 * 为什么值得为它单写一份
 * ─────────────────────
 * 笔记目录是这套插件里唯一"不填就等于整个世界看不见"的配置：不填 → 常驻桥不拉 →
 * `search_notes` 报未配置。把它藏进 profile 的 yml，等于要求用户先知道它存在。
 * 这份表单的全部目的就是让它在插件详情页上可见、可改、改完立即生效（volatile）。
 *
 * 形状与宿主表单保持一致（`shell()` / `field()` / `actions()`），`settings-section.js`
 * 才能把两份表单的状态合成一个保存按钮；刻意不依赖任何宿主模块，纯函数 + 订阅。
 */

/** 三个字段的配置路径。数组形状由宿主设置接口的 ops 协议决定。 */
const PATHS = {
  repo: ['notes', 'repo'],
  enabled: ['notes', 'enabled'],
  timeoutMs: ['notes', 'timeoutMs'],
}

/**
 * 用户没动过时显示什么。
 *
 * 取值走宿主 settings 快照的 `value`（= 当前生效值），不是自己再复制一份默认值；
 * `DEFAULTS` 只在快照不可用（宿主没提供这个命名空间）时兜住渲染。
 */
const DEFAULTS = { repo: '', enabled: true, timeoutMs: 30000 }

/**
 * 宿主设置快照给的是 `plainConfig` 之后的普通值；ref 形状仍兜一层。
 *
 * 不兜的话，一旦某个字段以 `{get()}` 形态到达，渲染出来就是 `[object Object]`，
 * 而那种"看得见但没用"的输入框比报错更难查。
 */
function unwrap(value) {
  return value && typeof value.get === 'function' ? value.get() : value
}

/** 超时下限：低于 1 秒连冷启动的进程 ready 都等不到。 */
const MIN_TIMEOUT_MS = 1000

const SPECS = {
  repo: {
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
    read: (value) => (value === false ? 'false' : 'true'),
    parse: (text) => text === 'true'
      ? { op: 'set', path: PATHS.enabled, value: true }
      : text === 'false'
        ? { op: 'set', path: PATHS.enabled, value: false }
        : undefined,
  },
  timeoutMs: {
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

export class NotesSettingsForm {
  constructor(scope) {
    this.scope = scope
    this.staged = new Map()
    this.listeners = new Set()
    this.baseline = undefined
    this.saving = false
    this.failed = false
    this.unsubscribe = typeof scope?.subscribe === 'function'
      ? scope.subscribe(() => { this.publish() })
      : undefined
  }

  /** 宿主快照：`value` 是生效值，`base` 是继承层（profile 与默认），`user` 是本条覆盖。 */
  snapshot() {
    try {
      return this.scope?.getSnapshot?.() ?? {}
    } catch {
      return {}
    }
  }

  sectionValue(key, layer = 'value') {
    const notes = this.snapshot()[layer]?.notes
    if (notes === undefined || notes === null) return key === 'repo' ? '' : DEFAULTS[key]
    const value = unwrap(notes[key])
    return value === undefined ? (key === 'repo' ? '' : DEFAULTS[key]) : value
  }

  /** 本条目是否在 profile 里被显式覆盖过（决定要不要显示"已覆盖"）。 */
  stored(key) {
    const notes = this.snapshot().user?.notes
    return notes !== undefined && notes !== null && Object.hasOwn(notes, key)
  }

  field(key) {
    const spec = SPECS[key]
    const draft = this.staged.get(key)
    if (draft === undefined) {
      return { text: spec.read(this.sectionValue(key)), overridden: this.stored(key), invalid: false }
    }
    const op = spec.parse(draft)
    return { text: draft, overridden: op !== undefined && op.op === 'set', invalid: op === undefined }
  }

  /** 待写入的 ops：只包含"与当前生效值不同且解析得出"的字段。 */
  plan() {
    const ops = []
    for (const [key, draft] of this.staged) {
      const spec = SPECS[key]
      if (draft === spec.read(this.sectionValue(key))) continue
      const op = spec.parse(draft)
      if (op !== undefined) ops.push(op)
    }
    return ops
  }

  shell() {
    const snapshot = this.snapshot()
    const ops = this.plan()
    let invalid = false
    for (const [key, draft] of this.staged) {
      if (SPECS[key].parse(draft) === undefined) invalid = true
    }
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable === true,
      dirty: ops.length > 0,
      invalid,
      saving: this.saving,
      failed: this.failed,
    }
  }

  stage(key, text) {
    this.baseline ??= this.snapshot()
    this.staged.set(key, text)
    this.failed = false
    this.publish()
  }

  discard() {
    if (this.staged.size === 0 && !this.failed) return
    this.staged.clear()
    this.baseline = undefined
    this.failed = false
    this.publish()
  }

  async save() {
    const ops = this.plan()
    if (this.saving || ops.length === 0 || this.shell().invalid) return
    if (typeof this.scope?.mutate !== 'function') return
    this.saving = true
    this.failed = false
    this.publish()
    let ok = false
    try {
      ok = await this.scope.mutate(ops, this.baseline?.revision)
    } catch {
      ok = false
    }
    this.saving = false
    if (ok) {
      this.staged.clear()
      this.baseline = undefined
    } else {
      // 保留草稿：宿主拒了（比如改完别人又动了配置），值不该被吞掉。
      this.failed = true
    }
    this.publish()
  }

  actions() {
    return {
      editNotes: (key, text) => { this.stage(key, text) },
      saveNotes: () => this.save(),
      discardNotes: () => { this.discard() },
    }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  publish() {
    for (const listener of this.listeners) listener()
  }

  dispose() {
    this.listeners.clear()
    if (typeof this.unsubscribe === 'function') this.unsubscribe()
    this.unsubscribe = undefined
  }
}
