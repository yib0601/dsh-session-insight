/**
 * MemoryView 的纯逻辑层：列表载荷解析与切页缓存。
 *
 * 从 MemoryView.tsx 中拆出（该文件 616 行，绝大部分是渲染）。这里零 React 依赖，
 * 可单独测试，也是 TaskCommandNode 解析 insight 载荷时的唯一入口。
 */
import { normalizeWindow } from './paging.js'

/** 切页缓存：任务/项目/全局三页在同一个面板里来回切时，30 秒内直接复用上一份列表，
 *  不再发 /tasks insight list。宿主每次命令都会在会话里留一个 command 节点，
 *  而"切回刚才那页"并不需要重新证明数据没变；动作之后的 reloadWindow 会更新缓存。 */
const INSIGHT_CACHE_TTL_MS = 30_000
const INSIGHT_CACHE_MAX = 12

const insightCache = new Map()

function insightCacheKey(sessionId, scope, root, boundTaskId) {
  // 同一会话里 cd 到另一个项目时 sessionId 不变；不带 root 会把上一个项目的列表复用过来。
  // task 页还依赖当前绑定的任务：换绑后必须重新取，不能复用上一个任务的草稿列表。
  return `${sessionId || ''}|${root || ''}|${scope}|${boundTaskId || ''}`
}

export function readInsightCache(sessionId, scope, root, boundTaskId) {
  const key = insightCacheKey(sessionId, scope, root, boundTaskId)
  const hit = insightCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > INSIGHT_CACHE_TTL_MS) {
    insightCache.delete(key)
    return null
  }
  return hit
}

export function invalidateInsightCache(sessionId, root) {
  const prefix = `${sessionId || ''}|${root || ''}|`
  for (const key of [...insightCache.keys()]) {
    if (key.startsWith(prefix)) insightCache.delete(key)
  }
}

export function writeInsightCache(sessionId, scope, root, boundTaskId, rows, total, nextOffset) {
  const key = insightCacheKey(sessionId, scope, root, boundTaskId)
  insightCache.delete(key)
  insightCache.set(key, { rows, total, nextOffset, at: Date.now() })
  while (insightCache.size > INSIGHT_CACHE_MAX) {
    const oldest = insightCache.keys().next().value
    if (oldest === undefined) break
    insightCache.delete(oldest)
  }
}

/**
 * 取命令输出里的 JSON 载荷：优先围栏块，其次从最后一个 `{` 起截。解析失败返回 null。
 * 抽出来是因为现在有**两种**载荷（列表 / 注入估算），JSON 提取逻辑只该有一份。
 */
export function parsePayloadText(text) {
  if (!text) return null
  let jsonBlock = null
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (fenced) jsonBlock = fenced[1]
  else {
    const lastBrace = text.lastIndexOf('{')
    if (lastBrace !== -1) jsonBlock = text.slice(lastBrace)
  }
  if (!jsonBlock) return null
  try {
    const data = JSON.parse(jsonBlock)
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export function parseInsightPayloadText(text) {
  const data = parsePayloadText(text)
  if (!data) return null
  {
    if (!Array.isArray(data.items)) return null
    // 分页字段走 paging.js 归一：老宿主没有 total/nextOffset 时按"一次给全"降级，
    // 新宿主则给出真实的下一页游标。
    const w = normalizeWindow(data, 0)
    // `root` 是宿主对 `root=` 参数的**回执**（这次到底读了哪个项目）：设置页拿它判断跨项目读取
    // 是否真的生效。归一化时必须原样带出来 —— 否则「宿主忽略了参数」与「宿主读对了」在界面上
    // 长得一模一样，而前者会让页面把别的项目的清单标成本项目的。
    return {
      scope: data.scope ?? 'project',
      root: typeof data.root === 'string' && data.root !== '' ? data.root : null,
      count: w.total,
      total: w.total,
      offset: w.offset,
      nextOffset: w.nextOffset,
      items: w.items,
    }
  }
}
