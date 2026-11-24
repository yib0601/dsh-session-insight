/**
 * `search_notes` —— 笔记检索（section 级 BM25 + 语义混合）。
 *
 * 定位：把原来作为独立 MCP 服务（`mcp__search-notes__*`）的笔记检索收进本插件，
 * 与记忆引擎共用一次加载、一套配置。检索语义不在这里实现 —— 这里是桥，内核仍是
 * `~/note/.notes/search_core.py`（与 CLI / MCP 同一份），所以改动笔记检索算法不需要
 * 动这个文件。
 *
 * 为什么必须如实报错而不是返回空数组
 * ──────────────────────────────────
 * "没命中"和"没装好"在模型眼里长得一模一样。笔记检索是日常第一动作，一旦把环境故障
 * 伪装成空结果，模型会以为换个词就能查到，于是反复换词空转。所以这里让失败抛出、
 * 把 mode 一并回传（`hybrid` / `degraded` 能直接看出语义层在不在）。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TEXT_OUTPUT } from '../../src/memory/tools/output.js'

/** 一次最多回多少条：内核自己 clamp 到 50，这里再收一道，避免上下文被检索结果塞满。 */
const MAX_LIMIT = 12
const DEFAULT_LIMIT = 6

/**
 * 未配置时的报错原文（唯一的真源，Host 的桥也用它）。
 *
 * 必须能**独立读通**：用户不翻文档、模型不猜，照着这一句就能落到正确的设置页上。
 * 之前这里写的是 "set `notes.repo` in this plugin's config" —— 纯技术坐标，界面上
 * 一个可点的入口都没有。
 */
export const NOT_CONFIGURED_MESSAGE =
  'search_notes: 笔记仓库未配置 —— 打开「设置 → 记忆与笔记 → 笔记检索」，'
  + '填好「笔记目录」（含 .notes/ 的仓库，如 ~/note）后点保存；也可以在 profile 的 cordis.patch.yml 里写 notes.repo。'

function formatHit(hit, index) {
  const kind = hit.isExperience ? '经验' : '锚点'
  const head = `${index + 1}. ${hit.path}  L${hit.line}  [${kind}]  ${hit.anchor || hit.title || ''}`
  const score = typeof hit.score === 'number' ? hit.score : 0
  const sources = Array.isArray(hit.sources) && hit.sources.length ? `  (${hit.sources.join('+')} ${score.toFixed(4)})` : ''
  const lines = [head + sources]
  if (hit.context) {
    for (const line of String(hit.context).split('\n')) lines.push(`   ${line}`)
  }
  return lines.join('\n')
}

export function searchNotesTool(provider, config) {
  return defineTool({
    name: 'search_notes',
    description:
      'Search the notes repository (section-level BM25 + semantic hybrid). '
      + 'Returns anchor hits with `path`, line and a short context; read the cited section instead of the whole file. '
      + 'This is the first move for problem-class questions: errors, how-to, config, troubleshooting, deployment steps. '
      + 'Empty hits are a real "nothing found" — try synonyms or narrow with tags/dir, do not keep guessing. '
      + 'Needs the notes directory set in Settings → Memory & notes; '
      + 'when it is unset the call fails with the exact place to fix.',
    parameters: {
      query: {
        type: 'string',
        description: 'Symptom words + object words, e.g. `conntrack 连接重置`. Chinese or English both work.',
      },
      limit: { type: 'number', description: `How many hits (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by note tags (directory names count as tags), e.g. ["网络"].',
      },
      dir: { type: 'string', description: 'Restrict to a path fragment, e.g. `系统/Linux`.' },
      exp_only: { type: 'boolean', description: 'Only return 【经验】 blocks.' },
      no_context: { type: 'boolean', description: 'Omit the context snippet (saves tokens).' },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const query = String(args?.query ?? '').trim()
      if (!query) throw new Error('search_notes: `query` is required')
      // `configured === false` 是桥的"当前没挂上"信号：目录被清空、或设置页刚改完还没生效。
      // 两种都按"未配置"如实报错 —— 静默返回空结果会让模型以为笔记里没有。
      if (!provider || provider.configured === false) throw new Error(NOT_CONFIGURED_MESSAGE)
      const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(args?.limit) ? Number(args.limit) : DEFAULT_LIMIT))
      const result = await provider.search({
        query,
        limit,
        tags: Array.isArray(args?.tags) ? args.tags.filter((t) => typeof t === 'string' && t) : undefined,
        dir: typeof args?.dir === 'string' && args.dir ? args.dir : undefined,
        expOnly: args?.exp_only === true,
        noContext: args?.no_context === true,
      })

      const header = `检索「${query}」 mode=${result.mode ?? '?'} semantic=${result.semantic ?? '?'} relevance=${result.relevance ?? '?'}`
      if (!result.results.length) {
        // 明确区分"降级"与"真没命中"：前者该去看语义层，后者才该换词。
        const suffix = result.semantic === 'unavailable'
          ? `（注意：语义层不可用，仅词面检索${result.error ? `：${result.error}` : ''}）`
          : ''
        return `${header}\n无命中 —— 换同义词/近义词再试，或用 tags / dir 收窄，勿硬凑。${suffix}`
      }
      const body = result.results.map((hit, i) => formatHit(hit, i)).join('\n')
      return `${header}\n\n${body}\n\n—— 按 path + 行号精读对应小节，勿整读文件。`
    },
  })
}
