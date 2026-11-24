/**
 * 嵌套路径设置表单的通用底座。
 *
 * 为什么需要它
 * ─────────────
 * 宿主导出的 `SettingsFormModel` 只会寻址**顶层键**（读 `value[field]`、写
 * `{op:'set', path:[field]}`），而本插件的可写配置都在 Config 的子对象里：
 * `notes.repo` / `insight.maxProject` / `autoContext.maxTokens`。宿主校验写路径时看的是
 * "最近 volatile 祖先"（`isVolatilePath`），`['notes.repo']` 这种单段字符串既匹配不到
 * schema，写进去还会被设置接口 400 拒掉。宿主的真写口是 `configForm.mutate(ops, revision)`，
 * ops 的 path 是**数组**（`['notes','repo']`）。
 *
 * 于是每个嵌套字段都需要同一套东西：草稿、脏判定、非法判定、保存（带 revision fence）、
 * 保存失败保留草稿、快照订阅。这套逻辑原先只活在「笔记检索」三个字段里；记忆规模是第二批，
 * 再抄一份就是两份会各自跑偏的实现，所以抽成这里。
 *
 * 契约（与宿主体贴保持）
 * ────────────────────
 *  - 只依赖注入进来的 `scope`（`getSnapshot` / `subscribe` / `mutate`），零宿主模块；
 *  - `shell()` 给出状态、`field()` 给出渲染所需的三元组，页面把两者合进自己的投影；
 *  - `plan()` 只产出「与当前生效值不同、且解析得出」的 ops —— 保存按钮的 disabled 判据与
 *    真正提交的 ops 必须同源，否则会出现"按钮亮着、点了什么也没发生"。
 *
 * 字段规格（`specs[key]`）
 *  - `section`：Config 里的子对象名（`notes` / `insight` / `autoContext`）；
 *  - `read(value)`：把生效值渲染成输入框文本；
 *  - `parse(text)`：把文本翻成 `{op:'set'|'unset', path, value?}`；`undefined` = 非法；
 *  - `fallback`：快照里读不到该键时显示的默认值（**不是**一份平行的默认配置表：能读到快照
 *    时永远以快照为准）。
 */

/** 宿主快照给的是 `plainConfig` 之后的普通值；ref 形状仍兜一层。 */
export function unwrap(value) {
  return value && typeof value.get === 'function' ? value.get() : value
}

export class NestedSettingsForm {
  /**
   * @param scope - 本条目在 `configForms` 里的 scope。
   * @param options.fields - 字段名数组，顺序即渲染顺序。
   * @param options.specs - 字段规格表（见文件头）。
   * @param options.actions - 生成的 action 名（`{ edit, save, discard }`）。
   */
  constructor(scope, options) {
    this.scope = scope
    this.fields = [...options.fields]
    this.specs = options.specs
    this.actionNames = options.actions ?? { edit: 'edit', save: 'save', discard: 'discard' }
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

  /** 某字段在某一层上的值；缺键时回落到 spec.fallback。 */
  sectionValue(key, layer = 'value') {
    const spec = this.specs[key]
    if (spec === undefined) return undefined
    const section = this.snapshot()[layer]?.[spec.section]
    if (section === undefined || section === null) return spec.fallback
    const value = unwrap(section[key])
    return value === undefined ? spec.fallback : value
  }

  /** 本条目是否在 profile 里被显式覆盖过（决定要不要显示"已覆盖"）。 */
  stored(key) {
    const section = this.snapshot().user?.[this.specs[key].section]
    return section !== undefined && section !== null && Object.hasOwn(section, key)
  }

  /** 一个字段的渲染态：文本 / 是否被显式覆盖 / 是否非法。 */
  field(key) {
    const spec = this.specs[key]
    const draft = this.staged.get(key)
    if (draft === undefined) {
      return { text: spec.read(this.sectionValue(key)), overridden: this.stored(key), invalid: false }
    }
    const op = spec.parse(draft)
    return { text: draft, overridden: op !== undefined && op.op === 'set', invalid: op === undefined }
  }

  /** 待写入的 ops：只包含「与当前生效值不同且解析得出」的字段。 */
  plan() {
    const ops = []
    for (const [key, draft] of this.staged) {
      const spec = this.specs[key]
      if (draft === spec.read(this.sectionValue(key))) continue
      const op = spec.parse(draft)
      if (op !== undefined) ops.push(op)
    }
    return ops
  }

  /** 表单级状态（页面把多份表单的状态合成一个保存按钮）。 */
  shell() {
    const snapshot = this.snapshot()
    const ops = this.plan()
    let invalid = false
    for (const [key, draft] of this.staged) {
      if (this.specs[key].parse(draft) === undefined) invalid = true
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

  /** 交给页面 `inject()` 的 action 集合。 */
  actions() {
    return {
      [this.actionNames.edit]: (key, text) => { this.stage(key, text) },
      [this.actionNames.save]: () => this.save(),
      [this.actionNames.discard]: () => { this.discard() },
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
