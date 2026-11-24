/**
 * 笔记目录的「选择」通道：把宿主的目录浏览能力包成两个问题 —— 能不能选、怎么列一层。
 *
 * 为什么不再让用户手打路径
 * ─────────────────────
 * `notes.repo` 是这套插件里唯一"填错就等于功能不存在"的配置：写错一个字符、
 * 忘了展开 `~`、选了上层目录（缺 `.notes/`），表现都是"模型没有 search_notes 工具"
 * 或"检索总是 degraded"，而错误现场在设置面板里完全看不出来。手打路径把这些失败
 * 形态全部留给用户自己排。
 *
 * 复用宿主已有的目录选择能力，而不是自己写一个文件系统 API
 * ──────────────────────────────────────────────────
 * 宿主本来就为「选择工作区」做了一整套：Client 服务 `uiWorkspace`（`listDirectory`
 * / `createDirectory`），底层是 Host 的 `remote.directoryPicker` 远程命名空间。
 * 走这一条的好处是零新增 Host 代码、零新增权限面：用户能选工作区，就一定能选这里，
 * 而且沙箱/审批语义完全一致。
 *
 * 两个服务名都软探测：`uiWorkspace` 由 ui-workspace 提供，`remote.directoryPicker`
 * 是 API 远程命名空间。任意一个可用即可；两个都没有时 {@link directoryAccess} 的
 * `available()` 返回 false，设置页回退成手写输入框（**不是**报错，也不是空面板）。
 */

/** 读一个服务，永不抛出（`ctx.get` 是 cordis 官方无 inject 入口）。 */
function readService(ctx, name) {
  if (ctx === null || ctx === undefined) return undefined
  try {
    if (typeof ctx.get === 'function') {
      const found = ctx.get(name)
      if (found !== undefined) return found
    }
  } catch {
    // 服务未装配或读取被拒：继续走属性回退。
  }
  try {
    return ctx[name]
  } catch {
    return undefined
  }
}

/**
 * 解析出「列一层目录」的实现。
 *
 * 返回的 `list` 只有一种失败形态：`Promise` reject（文案直接展示给用户）。
 * `remote.directoryPicker` 那条路要先解 `{ ok, value }` 信封 —— 不在这里统一，
 * 上层就会拿到一个"成功但 value 为 undefined"的谜。
 */
function resolveList(ctx) {
  const ui = readService(ctx, 'uiWorkspace')
  if (ui !== null && ui !== undefined && typeof ui.listDirectory === 'function') {
    return (path, signal) => ui.listDirectory(path, signal)
  }
  const remote = readService(ctx, 'remote')
  const picker = remote === null || remote === undefined ? undefined : remote.directoryPicker
  if (picker !== null && picker !== undefined && typeof picker.list === 'function') {
    return async (path, signal) => {
      const result = await picker.list(path, signal)
      if (result !== null && result !== undefined && result.ok === false) {
        const error = result.error
        throw new Error(error && error.message ? error.message : 'directory listing failed')
      }
      return result !== null && result !== undefined && result.ok === true ? result.value : result
    }
  }
  return null
}

/**
 * 解析出「原生选择框」的实现。
 *
 * 宿主两种装配都只暴露同一个远程命名空间：
 *   · `native`：`pick()` 打开操作系统自己的文件夹对话框（macOS AppKit / Linux zenity / Win32 IFileDialog）；
 *   · `browse`：`list()`/`createDirectory()` 给内嵌浏览器用，`pick()` 反过来会被拒。
 * 所以按钮的第一次点击要先问一句"到底装配了哪种"，见 {@link directoryAccess} 的 `mode()`。
 */
function resolvePick(ctx) {
  const ui = readService(ctx, 'uiWorkspace')
  if (ui !== null && ui !== undefined && typeof ui.pickDirectory === 'function') {
    return () => ui.pickDirectory()
  }
  const remote = readService(ctx, 'remote')
  const picker = remote === null || remote === undefined ? undefined : remote.directoryPicker
  if (picker !== null && picker !== undefined && typeof picker.pick === 'function') {
    return async () => {
      const result = await picker.pick()
      if (result !== null && result !== undefined && result.ok === false) {
        const error = result.error
        throw new Error(error && error.message ? error.message : 'directory pick failed')
      }
      return result !== null && result !== undefined && result.ok === true ? result.value : result
    }
  }
  return null
}

/** 宿主"这项能力没装配"的固定措辞（`directory-picker/unavailable` 系列）。 */
const CAPABILITY_REFUSAL = /directory-picker\/unavailable|needs the \w+ capability/i

/** 判断一个拒绝是不是"另一种装配才有这个动词"。 */
export function capabilityRefused(error) {
  const message = error && error.message ? String(error.message) : String(error ?? '')
  return CAPABILITY_REFUSAL.test(message)
}

/**
 * 目录浏览 / 原生选择的能力通道。
 *
 * `available()` 每次调用都重新探测：设置页是在宿主装配之后才渲染的，而装配顺序
 * 不由本插件决定（`uiWorkspace` 可能晚几百毫秒到位）。把结果缓存在构造时，
 * 就是"面板先渲染、选择器永远不出现"的那类 bug。
 *
 * `mode()` 才是**点击时**该问的问题，并且结果按会话缓存一次：
 *   - `'browse'` → 打开内嵌目录浏览器（远端部署的形态，宿主提供 list 动词）；
 *   - `'native'` → 直接调原生选择框（本机桌面的形态，宿主只提供 pick 动词）；
 *   - `'none'`   → 两个动词都没有，回退成手写输入框。
 * 两个动词在两种装配里**都存在签名**，只靠同步检查分不出来，所以探测只能靠一次真实调用；
 * 一次失败 RPC（几毫秒）比"按钮点了没反应"便宜得多。
 *
 * @param ctx - client 根上下文（没有时返回一个恒不可用的通道）。
 * @returns {{ available: () => boolean, mode: () => Promise<'browse'|'native'|'none'>,
 *   list: (path?: string, signal?: AbortSignal) => Promise<any>, pick: () => Promise<string|null> }}
 */
export function directoryAccess(ctx) {
  let cached
  return {
    available() {
      return resolveList(ctx) !== null || resolvePick(ctx) !== null
    },
    async mode() {
      if (cached !== undefined) return cached
      const list = resolveList(ctx)
      const pick = resolvePick(ctx)
      if (list === null) {
        cached = pick === null ? 'none' : 'native'
        return cached
      }
      try {
        await list(undefined)
        cached = 'browse'
      } catch (error) {
        cached = pick !== null && capabilityRefused(error) ? 'native' : 'browse'
      }
      return cached
    },
    list(path, signal) {
      const list = resolveList(ctx)
      return list === null
        ? Promise.reject(new Error('no directory service'))
        : list(path, signal)
    },
    pick() {
      const pick = resolvePick(ctx)
      return pick === null
        ? Promise.reject(new Error('no directory service'))
        : pick()
    },
  }
}

/**
 * 选择器首次打开时列哪个目录。
 *
 * 只有**绝对路径**值得直接试：配置里写 `~/note` 是自然的，但 Host 的目录列举
 * 只认绝对路径（波浪号在 `host/notes/provider.js` 里才展开）。`~/…` 直接丢给
 * 宿主 home，用户自己点两下就到；比"列出一个不存在的目录 + 一行报错"友好得多。
 *
 * @param value - 当前配置值（可能为空、可能带 `~`）。
 * @returns 绝对路径，或 `undefined`（= 让宿主列 home）。
 */
export function initialDirectory(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.startsWith('/') ? text : undefined
}

/**
 * 面包屑第一项的文案：根路径本身没有"名字"，显示成全路径才看得出在哪儿。
 *
 * @param crumb - Host 给的 `{ name, path }`。
 * @returns 可点击的标签文案。
 */
export function crumbLabel(crumb) {
  if (crumb === null || crumb === undefined) return ''
  const name = typeof crumb.name === 'string' ? crumb.name : ''
  const path = typeof crumb.path === 'string' ? crumb.path : ''
  return name === '' ? path : name
}
