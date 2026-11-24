/**
 * 测试用的 ui-primitives 替身。
 *
 * 真实包由宿主 seed 提供（浏览器侧），本仓不装。设置页只用到三样：`Button`、`Switch`
 * 与 `SettingsFormModel`，替身按同样的**形状**给最小实现：
 *  - Button / Switch 是可渲染组件（真宿主里 Button 被 `forwardRef` 包成对象 —— 替身用函数
 *    即可，`isComponent()` 两种形状都接受）；
 *  - `SettingsFormModel` 只要 `bind()` 返回一个带 `set`/`subscribe` 的 store，本页就用它
 *    提供 SnapshotStore 与 scope 订阅（字段表刻意为空，见 settings-section.js）。
 */
import { createElement } from './react-stub.mjs'

export function Button(props) {
  const { children, ...rest } = props ?? {}
  return createElement('button', { ...rest, disabled: props?.disabled === true }, children ?? null)
}

export function Switch(props) {
  return createElement('span', {
    'data-switch': props?.checked === true ? 'on' : 'off',
    'aria-disabled': props?.disabled === true ? 'true' : undefined,
  }, props?.label ?? null)
}

/** SnapshotStore 的最小可用替身：`set` 发布、`subscribe` 订阅、`getSnapshot` 读当前值。 */
class StubStore {
  constructor(compute) {
    this.compute = compute
    this.value = compute()
    this.listeners = new Set()
  }

  set(value) {
    this.value = value
    for (const listener of this.listeners) listener(value)
  }

  getSnapshot() {
    return this.value
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

export class SettingsFormModel {
  constructor(scope, fields = []) {
    this.scope = scope
    this.fields = fields
  }

  bind(compute) {
    const store = new StubStore(compute)
    this.store = store
    return store
  }

  shell() {
    return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }
  }

  field() {
    return { text: '', overridden: false, invalid: false }
  }

  plan() {
    return []
  }

  async save() {}

  discard() {}

  actions() {
    return { edit: () => {}, save: () => {}, discard: () => {} }
  }

  dispose() {}
}
