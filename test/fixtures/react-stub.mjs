/**
 * 测试用的极简 React 替身。
 *
 * 为什么需要它：`client-memory-src/settings-section.js` 在模块顶层 `import ... from 'react'`，
 * 而本仓没有 react 依赖（运行期由宿主 seed 注入）。要在 Node 里验证"这一页渲染得出来、
 * 文案 key 都存在、数字字段带着配置值"，就必须让这个裸模块说明符解析到一个替身 ——
 * 见 test/settings-section.render.test.js 的 `registerHooks`。
 *
 * 支持面刻意很小：createElement / useState / useEffect / useRef / useCallback / useMemo /
 * Fragment + 一个把元素树展开成普通对象的 renderTree。不支持：
 *  - 重渲染（state 更新不触发第二次渲染）—— 这层验证只关心首次渲染的结构与文案；
 *  - useEffect 的执行（渲染期副作用在 Node 里既没必要也不安全）。
 * 组件实例以**元素对象身份**为 key 保存 hook 槽位，所以同一个元素对象重复渲染会复用状态。
 */

/** 当前正在渲染的组件实例（null = 不在组件体内）。 */
let current = null
/** 元素对象 → { slots, index }。用 WeakMap 避免把渲染状态留成泄漏。 */
const instances = new WeakMap()

function slotsFor(element) {
  let entry = instances.get(element)
  if (entry === undefined) {
    entry = { slots: [], index: 0 }
    instances.set(element, entry)
  }
  return entry
}

export function createElement(type, props, ...children) {
  const key = props && props.key !== undefined ? props.key : undefined
  const nextProps = props === null || props === undefined ? {} : { ...props }
  delete nextProps.key
  if (children.length === 1) nextProps.children = children[0]
  else if (children.length > 1) nextProps.children = children
  return { type, props: nextProps, key }
}

export function Fragment(props) {
  return props ? props.children : null
}

export class Component {
  constructor(props) {
    this.props = props
    this.state = {}
  }

  setState() {}

  render() {
    return null
  }
}

export function useState(initial) {
  const entry = current
  const index = entry.index
  entry.index += 1
  if (!Object.hasOwn(entry.slots, index)) {
    entry.slots[index] = typeof initial === 'function' ? initial() : initial
  }
  const set = (value) => {
    entry.slots[index] = typeof value === 'function' ? value(entry.slots[index]) : value
  }
  return [entry.slots[index], set]
}

export function useRef(initial) {
  const entry = current
  const index = entry.index
  entry.index += 1
  if (!Object.hasOwn(entry.slots, index)) entry.slots[index] = { current: initial }
  return entry.slots[index]
}

export function useMemo(factory) {
  current.index += 1
  return factory()
}

export function useCallback(callback) {
  current.index += 1
  return callback
}

/** 只占位：渲染期不执行副作用。 */
export function useEffect() {
  current.index += 1
}

export function useLayoutEffect() {
  current.index += 1
}

export function useContext() {
  current.index += 1
  return {}
}

/**
 * 把元素树展开成可断言的普通对象。
 *
 * 形状：`{ type, props, children: [...] }`；文本节点是 `{ text }`。
 * @param {any} node - createElement 的返回值、数组、字符串或 null。
 * @returns {object|null} 展开后的节点。
 */
export function renderTree(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (Array.isArray(node)) {
    const children = []
    for (const child of node) {
      const rendered = renderTree(child)
      if (rendered !== null) children.push(rendered)
    }
    return { type: '#fragment', props: {}, children }
  }
  if (typeof node === 'string' || typeof node === 'number') return { text: String(node) }
  const element = node
  if (typeof element.type === 'function') {
    const outer = current
    const entry = slotsFor(element)
    entry.index = 0
    current = entry
    let output
    try {
      output = element.type(element.props)
    } finally {
      current = outer
    }
    const rendered = renderTree(output)
    return rendered === null ? null : { ...rendered, component: element.type.name || null }
  }
  if (typeof element.type === 'string') {
    const children = []
    const kids = element.props.children
    const list = Array.isArray(kids) ? kids : [kids]
    for (const child of list) {
      const rendered = renderTree(child)
      if (rendered !== null) children.push(rendered)
    }
    return { type: element.type, props: element.props, children }
  }
  return null
}

/**
 * 收集渲染树里所有文本（按深度优先顺序）。
 * @param {object|null} tree - renderTree 的结果。
 * @returns {Array<string>} 文本片段。
 */
export function collectText(tree) {
  if (tree === null || tree === undefined) return []
  if (typeof tree.text === 'string') return [tree.text]
  const out = []
  for (const child of tree.children ?? []) out.push(...collectText(child))
  return out
}

/**
 * 收集渲染树里所有元素（含 class / props），按深度优先顺序。
 * @param {object|null} tree - renderTree 的结果。
 * @returns {Array<object>} 元素节点。
 */
export function collectElements(tree) {
  if (tree === null || tree === undefined || typeof tree.text === 'string') return []
  const out = [tree]
  for (const child of tree.children ?? []) out.push(...collectElements(child))
  return out
}
