/**
 * 「看哪个项目」下拉框的行模型（纯逻辑，无 React、无宿主调用）。
 *
 * 这里原来给的是「当前会话项目」只读文本 + 「选择项目…」按钮（弹系统文件夹对话框）。
 * 问题是**宿主的左侧栏本来就把工作区全列出来了**：用户已经认得那几条的名字与顺序，
 * 设置页却要他从零在文件系统里再翻一遍目录，等于同一份清单让人挑两次；而且当前项目
 * 只显示成一行灰字，看不出"我现在看的是哪个"。
 *
 * 所以改成下拉框：选项直接取宿主的工作区注册表（`ctx.workspaces.list` 的 `items`），
 * 默认选中当前会话所在的那个项目，并在选项文本里标出来。两条细节必须处理：
 *   1. 工作区注册表读不到（老宿主 / 服务没装配）时，退化成"会话行上出现过的 cwd"，
 *      否则下拉框会空掉、连当前项目都选不了；
 *   2. 用户在浏览对话框里挑的目录可能**还不是工作区**，必须补成一条"外来"选项 ——
 *      否则 select 的 value 对不上任何 option，浏览器会把选择显示成空白。
 *
 * 这一层刻意不碰 DOM 与 ctx：它只做快照 → 行模型，因此能在 Node 里直接单测。
 */
import { sessionCwd, sessionRows } from './session-id.js'

/** 路径末段（"这个项目叫什么"的兜底）。 */
export function basename(p) {
  const text = String(p ?? '').replace(/\/+$/, '')
  const cut = text.lastIndexOf('/')
  return cut < 0 ? text : text.slice(cut + 1)
}

/** 比较用的路径键：去首尾空白、合并重复斜杠、去掉尾部斜杠。 */
export function pathKey(p) {
  const text = String(p ?? '').trim()
  if (text === '') return ''
  return text.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1')
}

/** 两个路径是否指向同一个目录（宿主给的 `path` 与 `cwd` 可能差一个尾斜杠）。 */
export function samePath(left, right) {
  const key = pathKey(left)
  return key !== '' && key === pathKey(right)
}

/** 路径太长时从中间省略，保住末两级目录（"是哪个项目"通常看尾巴）。 */
export function shortPath(p, max = 44) {
  const text = String(p ?? '')
  if (text.length <= max) return text
  const parts = text.split('/')
  const tail = parts.slice(-2).join('/')
  return `${text.slice(0, Math.max(6, max - tail.length - 2))}…/${tail}`
}

/**
 * 工作区注册表快照 → `[{ path, title }]`，按宿主顺序去重。
 * 兼容三种输入：完整快照（`{ items }`）、裸数组、以及什么都没有。
 * @param {object|Array|undefined|null} snap - `ctx.workspaces.list.getSnapshot()`
 * @returns {Array<{path: string, title: string}>} 没有可用行时为 `[]`
 */
export function workspaceRows(snap) {
  const items = Array.isArray(snap) ? snap : Array.isArray(snap?.items) ? snap.items : []
  const seen = new Set()
  const rows = []
  for (const item of items) {
    const path = pathKey(item?.path)
    if (path === '' || seen.has(path)) continue
    seen.add(path)
    const title = typeof item?.title === 'string' && item.title.trim() !== ''
      ? item.title.trim()
      : basename(path)
    rows.push({ path, title })
  }
  return rows
}

/**
 * 注册表不可用时的退化项目列表：会话快照里出现过的 `cwd`（按宿主顺序、去重）。
 * 只在 `workspaces` 服务缺失时走这条 —— 那时"会话在哪个目录跑过"是唯一还能读到的线索。
 * @param {object|undefined|null} snap - `ctx.sessions.list.getSnapshot()`
 * @returns {Array<{path: string, title: string}>}
 */
export function cwdRows(snap) {
  const seen = new Set()
  const rows = []
  for (const row of sessionRows(snap)) {
    const cwd = pathKey(sessionCwd(snap, row.id))
    if (cwd === '' || seen.has(cwd)) continue
    seen.add(cwd)
    rows.push({ path: cwd, title: basename(cwd) })
  }
  return rows
}

/**
 * 下拉框模型：选项、当前会话项目、当前选中项。
 *
 * `currentPath` 与 `options` 分开给，是因为"跟随会话"这件事必须能表达：选中项等于
 * `currentPath` 时调用方清掉本地覆盖（不写 localStorage），会话一切换下拉框自动跟着走；
 * 选了别的项目才写成覆盖（只读视图）。
 * @param {object} [input] - 三个快照 + 会话 id + 本地覆盖路径
 * @param {object|Array|null} [input.workspaces] - 工作区注册表快照
 * @param {object|null} [input.sessions] - 会话列表快照
 * @param {string|null} [input.sessionId] - 当前会话 id
 * @param {string|null} [input.override] - 用户在上次会话里选的项目根（localStorage）
 * @returns {{options: Array<{path: string, title: string, current: boolean, foreign: boolean}>, currentPath: string|null, selected: string, foreign: boolean}}
 */
export function projectModel(input = {}) {
  const { workspaces, sessions, sessionId, override } = input
  const cwd = sessionCwd(sessions, sessionId)
  const registered = workspaceRows(workspaces)
  const rows = registered.length > 0 ? registered : cwdRows(sessions)

  // 当前会话项目：注册表里与 cwd 同一个目录的那一条（用它的 path，才能让 option 对上），
  // 匹配不上（会话在未注册的目录里跑）时就用 cwd 本身。
  const matched = cwd === null ? null : rows.find((row) => samePath(row.path, cwd)) ?? null
  const currentPath = matched !== null ? matched.path : cwd === null ? null : pathKey(cwd)

  const options = rows.map((row) => ({
    path: row.path,
    title: row.title,
    current: samePath(row.path, currentPath),
    foreign: false,
  }))
  if (currentPath !== null && matched === null) {
    options.unshift({ path: currentPath, title: basename(currentPath), current: true, foreign: false })
  }

  const wanted = pathKey(override)
  const hit = wanted === '' ? null : options.find((option) => samePath(option.path, wanted)) ?? null
  if (wanted !== '' && hit === null) {
    options.push({ path: wanted, title: basename(wanted), current: false, foreign: true })
  }

  const selected = hit !== null ? hit.path : wanted !== '' ? wanted : currentPath ?? ''
  return {
    options,
    currentPath,
    selected,
    // 有没有"正在看别的项目"：选中项不是当前会话项目时为 true（那种视图只读）。
    foreign: selected !== '' && currentPath !== null && !samePath(selected, currentPath),
  }
}

/**
 * 下拉框里一行显示什么：只给项目名（自定义标题优先，否则路径末段），不铺路径。
 *
 * 这批选项就是宿主左侧栏那份工作区清单，所有人家的前缀都一样（`/home/<user>/Code/…`），
 * 铺出来只是把真正要认的名字挤到右侧、还把下拉框撑宽。名字在本机是唯一的辨识依据，
 * 全路径退到 hover 提示上（渲染侧给 `<option>` 挂 `title`），要核对目录时再看不迟。
 * @param {{path: string, title?: string}} option - 一行
 * @returns {string} 选项文本（不含"当前"标记，标记由渲染侧加）
 */
export function projectOptionLabel(option) {
  const title = String(option?.title ?? '').trim()
  if (title !== '') return title
  return basename(String(option?.path ?? ''))
}
