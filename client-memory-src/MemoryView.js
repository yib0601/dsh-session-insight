/**
 * Memory View — 记忆三作用域列表（Task 草稿 / Project / Global）
 * 数据通道与任务面板一致：remote.commands.execute 执行 `/tasks insight …`，取 JSON 载荷。
 * 动作：confirm(草稿审核) / promote(向上提升) / demote(向下降级，需绑定任务) / archive / restore / delete
 *
 * 列表是**增量加载**的：首屏只取 PAGE_SIZE 条，滚到底前 600px 预取下一页追加。
 * 分页的决策逻辑在 paging.js（纯函数，可单测），本组件只把它接到渲染上。
 *
 * 由 .tsx 手写改写为 createElement（原 616 行 / 67 处 JSX）。
 * 载荷解析与缓存已拆到 memory-load.js。
 */
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { invokeCommand } from './commands.js'
import { insightKindLabel } from './kind-label.js'
import {
  HOST_PAGE_MAX, PAGE_SIZE, PREFETCH_MARGIN, SPINNER_DELAY_MS,
  appendUnique, createRequestGate, insightListLine, progressCounts,
} from './paging.js'
import { parseInsightPayloadText, readInsightCache, writeInsightCache, invalidateInsightCache } from './memory-load.js'
import { css } from './styles.js'

export function MemoryView({ ctx, sessionId, scope, root, boundTaskId, showHints, t }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  // 分页期间列表可能被别处改动（删除/提升）：offset 窗口会整体前移，appendUnique 只能去重、
  // 补不回漏掉的行。记住服务端 total，发现变化就回到第一页重取。
  const totalRef = useRef(0)
  const [nextOffset, setNextOffset] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // 失败的那一页：重试必须重放它，而不是只重取第一页（否则 nextOffset/rows 不变，
  // 观察器不会重新武装，界面永远卡在“已显示 30 / 60”）。
  const failedPageRef = useRef(null)
  // 加载指示延迟显示：本地数据几十毫秒就回来，立刻显示只会"闪一下"（见 paging.js）。
  const [showSpinner, setShowSpinner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ title: '', kind: 'lesson', body: '', steps: '', trigger: '' })
  const [savedTip, setSavedTip] = useState(null)
  // 滚动容器（IntersectionObserver 的 root）：哨兵是否"可见"必须相对这个容器判定，
  // 用视口当 root 会让面板自身的 480px 上限失效。
  const scrollRef = useRef(null)
  const sentinelRef = useRef(null)

  const runLine = useCallback(async (line) => {
    // 与任务面板同一条命令层：超时/取消、`{ok:false,error}` 信封、错误归一都只在这里做一次。
    const result = await invokeCommand(ctx, sessionId, line)
    return result.ok ? { ok: true, text: result.text } : { ok: false, text: result.error || 'command failed' }
  }, [ctx, sessionId])

  // 并发控制走 paging.js 的 createRequestGate()：过期响应丢弃、新请求照发。
  // （早期用"有在途请求就 return"的布尔守卫时，切 scope 的新请求会被直接丢掉，
  //  新列表于是一直空着——见 createRequestGate 的注释。）
  const gateRef = useRef(null)
  if (gateRef.current === null) gateRef.current = createRequestGate()
  // 作用域变了之后到达的过期响应必须丢弃，否则会把上一个 scope 的条目追加进来。
  const scopeRef = useRef(scope)
  useEffect(() => {
    scopeRef.current = scope
  }, [scope])
  // 切 scope / 会话 / 项目时关掉编辑表单：否则在 project 页点开的 Edit 会把 project id
  // 发到 global 层（新建表单更会把内容写进另一层）。
  useEffect(() => {
    setShowNew(false)
    setEditingId(null)
    setForm({ title: '', kind: 'lesson', body: '', steps: '', trigger: '' })
    setSavedTip(null)
  }, [scope, sessionId, root])

  /**
   * 取一页并落到状态里。
   * @param offset 起始下标。
   * @param limit 本页条数。
   * @param append true=追加到已渲染列表；false=替换成这一页（首屏或前缀重放）。
   * @param opts.prefix 前缀重放时忽略 total 变化（由调用方连续取页直到目标条数）。
   * @returns 本页条数与下一页 offset；请求被取代/失败时为 null。
   */
  const load = useCallback(async (offset, limit, append, opts = {}) => {
    // 没有活跃会话时不发命令、也不报错：面板顶部已经显示「还没有会话」，
    // 再报一次"同步失败"会让人以为记忆库坏了（0.1.7 上会话快照结构变化时就是这个表象）。
    if (!sessionId) {
      setRows([])
      setTotal(0)
      setNextOffset(null)
      setError(null)
      setLoading(false)
      failedPageRef.current = null
      return null
    }
    const requestedScope = scopeRef.current
    const key = `${requestedScope}|${offset}|${limit}|${append}`
    const ticket = gateRef.current.begin(key)
    if (ticket === false) return null
    if (!append) setLoading(true)
    setLoadingMore(append)
    setError(null)
    const spinner = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
    try {
      const res = await runLine(insightListLine(requestedScope, offset, limit))
      // 已被更新的请求取代，或切了作用域：这份响应属于上一个列表，整份丢弃。
      if (gateRef.current.isStale(ticket, requestedScope, scopeRef.current)) return null
      if (!res.ok) {
        failedPageRef.current = { offset, append }
        setError(res.text)
        return null
      }
      const parsed = parseInsightPayloadText(res.text)
      if (!parsed) {
        failedPageRef.current = { offset, append }
        setError('unparsable payload')
        return null
      }
      if (append && !opts.prefix && parsed.total !== totalRef.current) {
        // 列表在翻页时变了：丢掉这一页，从 0 重新取，避免永久漏行。
        totalRef.current = parsed.total
        void loadRef.current(0, PAGE_SIZE, false)
        return null
      }
      failedPageRef.current = null
      totalRef.current = parsed.total
      setRows((prev) => {
        const next = append ? appendUnique(prev, parsed.items) : parsed.items
        writeInsightCache(sessionId, requestedScope, root, boundTaskId, next, parsed.total, parsed.nextOffset)
        return next
      })
      setTotal(parsed.total)
      setNextOffset(parsed.nextOffset)
      return { count: parsed.items.length, nextOffset: parsed.nextOffset }
    } finally {
      window.clearTimeout(spinner)
      // 加载标志只由最后一次请求回落：过期请求提前清掉会让界面"看起来加载完了"。
      if (gateRef.current.end(key, ticket)) {
        setShowSpinner(false)
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [runLine, sessionId, root, boundTaskId])

  // load 的身份随 runLine 变（ctx/sessionId 变化）；用 ref 持有它，让下面的 effect
  // 只依赖 scope/sessionId 这两个**原始值**——把函数身份拉进依赖会重跑 effect 并
  // 无限刷 /insight 命令（旧实现用 800ms 频控绕开，这里从根上避免）。
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    // 换 scope / 换会话 = 换了一个列表：先看 30 秒缓存，命中就不发命令。
    setRows([])
    setTotal(0)
    totalRef.current = 0
    setNextOffset(null)
    setError(null)
    failedPageRef.current = null
    if (!sessionId) return
    const cached = readInsightCache(sessionId, scope, root, boundTaskId)
    if (cached) {
      // 缓存命中不发请求，但必须推进闸门序号：否则上一个 scope/project 的在途响应
      // 仍会被判为“最新”，把旧列表套到当前 root 上。
      const gate = gateRef.current
      const key = `cache|${scope}|${root || ''}|${boundTaskId || ''}`
      const ticket = gate.begin(key)
      if (ticket !== false) gate.end(key, ticket)
      setRows(cached.rows)
      setTotal(cached.total)
      totalRef.current = cached.total
      setNextOffset(cached.nextOffset)
      // 上一页的在途请求可能还没回落；缓存命中时直接把加载态关掉。
      setLoading(false)
      setLoadingMore(false)
      setShowSpinner(false)
      return
    }
    void loadRef.current(0, PAGE_SIZE, false)
  }, [scope, sessionId, root, boundTaskId])

  // 滚到底之前就取下一页（rootMargin 600px）。哨兵消失（nextOffset=null）即停止。
  useEffect(() => {
    if (nextOffset === null || typeof IntersectionObserver === 'undefined') return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadRef.current(nextOffset, PAGE_SIZE, true)
      },
      // root 用面板自己的滚动容器；取不到时退回视口（仍比"不加载"好）。
      { root: scrollRef.current ?? null, rootMargin: PREFETCH_MARGIN },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [nextOffset, rows.length])

  /**
   * 重载**已加载的整个前缀**（不是重置成第一页）：动作之后用户的位置不该跳回顶部。
   * 宿主单页上限是 HOST_PAGE_MAX，超过它时必须连续拉多页，否则一次动作会把 500 条
   * 已加载列表截回 200 条（旧实现说的“余下由 nextOffset 追加”，
   * 但替换式加载不会自动追加）。
   */
  const loadPrefix = useCallback(async (desired) => {
    const target = Math.max(PAGE_SIZE, desired || 0)
    let offset = 0
    let loaded = 0
    for (let guard = 0; guard < 100 && loaded < target; guard++) {
      const win = await loadRef.current(offset, Math.min(HOST_PAGE_MAX, target - loaded), offset !== 0, { prefix: true })
      if (!win) break
      loaded += win.count
      if (win.nextOffset === null) break
      offset = win.nextOffset
    }
  }, [])
  const reloadWindow = useCallback(async () => {
    await loadPrefix(rows.length)
  }, [loadPrefix, rows.length])

  const act = async (action, id) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const line = `/tasks insight ${action} ${scope} ${id}${action === 'demote' && scope === 'project' && boundTaskId ? ` ${boundTaskId}` : ''}`
      const res = await runLine(line)
      if (!res.ok) {
        setError(res.text)
      } else {
        invalidateInsightCache(sessionId, root)
        await reloadWindow()
      }
    } finally {
      setBusy(false)
    }
  }

  const rowToForm = (row) => {
    // 正文按 kind 取专属字段（fix/solution/reason），避免把与标题相同的 pattern/problem 当正文。
    // procedure 的 row.body 是服务端 insSummary 合成的“步骤 N 条：…”——它不是正文，
    // 表单里也没有对应输入框；预填后提交会把合成摘要写进真实 body，所以这里不预填。
    const main =
      row.kind === 'lesson' ? row.fix
        : row.kind === 'experience' ? row.solution
          : row.kind === 'decision' ? row.reason
            : row.kind === 'procedure' ? ''
              : row.body
    const body = main && main !== row.title ? main : ''
    return {
      title: row.title || '',
      kind: row.kind || 'lesson',
      body,
      steps: Array.isArray(row.steps) ? row.steps.join('\n') : '',
      trigger: (row.trigger?.keywords || []).join(','),
    }
  }

  const startEdit = (row) => {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowNew(true)
    setError(null)
  }

  const closeForm = () => {
    setShowNew(false)
    setEditingId(null)
    setForm({ title: '', kind: 'lesson', body: '', steps: '', trigger: '' })
  }

  // 切换类型时把当前输入迁移到目标类型的主内容区，避免换类型后“刚写的东西消失”
  const changeKind = (next) => {
    setForm((prev) => {
      if (prev.kind === next) return prev
      const fromProc = prev.kind === 'procedure'
      const toProc = next === 'procedure'
      let body = prev.body
      let steps = prev.steps
      if (fromProc && !toProc && !body && steps.trim()) body = steps.trim() // procedure → 正文
      if (toProc && !fromProc && !steps.trim() && body.trim()) steps = body.trim() // 正文 → 步骤
      return { ...prev, kind: next, body, steps }
    })
  }

  const submitNew = async () => {
    if (scope === 'task' && !editingId) return
    if (busy) return
    const title = form.title.trim()
    if (!title) return
    setBusy(true)
    setError(null)
    try {
      const fields = { title, kind: form.kind }
      // 标题镜像只用于**新建**：编辑时 pattern/choice/problem 不出现在表单里，
      // 无条件回传会把它们静默覆盖成标题（且宿主的 edit 路径不写 prev，无法还原）。
      if (!editingId) {
        if (form.kind === 'lesson') fields.pattern = title
        if (form.kind === 'decision') fields.choice = title
        if (form.kind === 'experience') fields.problem = title
      }
      // procedure 的正文由 steps 表达；不要把 body 一起提交（它只可能是合成摘要）。
      // 编辑时必须把本表单拥有的字段都带上（空串/空数组表示清空）：宿主只合并出现的键，
      // 省略会让“清空正文/步骤”变成静默空操作。
      if (form.kind !== 'procedure' && (editingId || form.body.trim())) {
        const body = form.body.trim()
        if (form.kind === 'lesson') fields.fix = body
        else if (form.kind === 'decision') fields.reason = body
        else if (form.kind === 'experience') fields.solution = body
        else fields.body = body
      }
      const editingRow = editingId ? rows.find((r) => r.id === editingId) : null
      // procedure 的列表载荷被宿主截到 50 条：编辑标题/正文时若整份回传，会删掉第 51 条起。
      // 载荷带 stepsTotal 时以它为准；没有该字段（旧宿主）保持原行为。
      const stepsTruncated = Boolean(editingId && (editingRow?.stepsTotal ?? 0) > 50)
      if (form.kind === 'procedure' && (editingId || form.steps.trim()) && !stepsTruncated) {
        fields.steps = form.steps.split('\n').map((s) => s.trim()).filter(Boolean)
      }
      if (form.kind === 'procedure' && (editingId || form.trigger.trim())) {
        fields.trigger = { keywords: form.trigger.split(/[,，]/).map((s) => s.trim()).filter(Boolean) }
      }
      const line = editingId
        ? `/tasks insight edit ${scope} ${editingId} ${JSON.stringify(fields)}`
        : `/tasks insight save ${scope} ${JSON.stringify(fields)}`
      const res = await runLine(line)
      if (!res.ok) {
        setError(res.text)
      } else {
        setSavedTip(t('mem.saved'))
        closeForm()
        window.setTimeout(() => setSavedTip(null), 2500)
        invalidateInsightCache(sessionId, root)
        await reloadWindow()
      }
    } finally {
      setBusy(false)
    }
  }

  const items = rows
  const progress = progressCounts(items.length, total)

  // ---- 头部工具条 ----
  const toolbar = h('div', { className: css.memToolbar },
    h('span', { className: css.memCount },
      scope === 'task' ? t('mem.scope.task') : scope === 'global' ? t('mem.scope.global') : t('mem.scope.project'),
      total > 0 ? ` · ${total}` : ''),
    h('span', { className: css.memToolbarActs },
      savedTip ? h('span', { className: css.badge }, savedTip) : null,
      scope !== 'task' && !showNew
        ? h(Button, {
            variant: 'outline', size: 'sm', disabled: busy,
            onClick: () => { setShowNew(true); setEditingId(null); setError(null) },
          }, t('mem.new'))
        : null,
      h(Button, {
        variant: 'outline', size: 'sm',
        onClick: () => { void reloadWindow() },
        disabled: loading,
        title: showHints ? t('panel.refresh') : undefined,
        'aria-label': t('panel.refresh'),
      }, '↻')))

  // ---- 新建 / 编辑表单 ----
  const newForm = showNew && scope !== 'task'
    ? h('div', { className: css.memNew },
        h('input', {
          className: css.stepInput,
          placeholder: t('mem.f.title'),
          value: form.title,
          onChange: (e) => setForm({ ...form, title: e.target.value }),
          autoFocus: true,
        }),
        h('div', { className: css.memNewRow },
          h('label', { className: css.memLabel }, t('mem.f.kind'),
            h('select', {
              className: css.stepInput,
              value: form.kind,
              onChange: (e) => changeKind(e.target.value),
            },
              h('option', { value: 'lesson' }, 'lesson'),
              h('option', { value: 'decision' }, 'decision'),
              h('option', { value: 'procedure' }, 'procedure'),
              h('option', { value: 'experience' }, 'experience')))),
        form.kind !== 'procedure'
          ? h('textarea', {
              className: css.stepInput,
              placeholder: t('mem.f.body'),
              rows: 2,
              value: form.body,
              onChange: (e) => setForm({ ...form, body: e.target.value }),
            })
          : h('div', null,
              h('textarea', {
                className: css.stepInput,
                placeholder: t('mem.f.steps'),
                rows: 3,
                value: form.steps,
                onChange: (e) => setForm({ ...form, steps: e.target.value }),
              }),
              h('input', {
                className: css.stepInput,
                placeholder: t('mem.f.trigger'),
                value: form.trigger,
                onChange: (e) => setForm({ ...form, trigger: e.target.value }),
              })),
        h('div', { className: css.memActs },
          h(Button, {
            variant: 'outline', size: 'sm',
            disabled: busy || !form.title.trim(),
            onClick: () => { void submitNew() },
          }, t('mem.save')),
          h(Button, { variant: 'outline', size: 'sm', onClick: closeForm }, t('mem.cancel'))))
    : null

  // ---- 错误条（带重试出口）----
  const errorBar = error
    ? h('div', { className: css.notice },
        `${t('mem.error')}: ${error}`,
        // 失败必须给出口：增量加载里"卡住不动"和"已经加载完"外观一样，没有重试按钮
        // 用户只能靠开关面板碰运气。
        h(Button, {
          variant: 'outline', size: 'sm',
          disabled: loading || loadingMore,
          onClick: () => {
            const failed = failedPageRef.current
            if (failed) void loadRef.current(failed.offset, PAGE_SIZE, failed.append)
            else void reloadWindow()
          },
        }, t('mem.retry')))
    : null

  // ---- 列表行 ----
  const rowNodes = items.map((row) => {
    const canDemoteToTask = scope === 'project' && !!boundTaskId
    return h('div', {
      key: row.id,
      className: `${css.memRow}${row.archived ? ` ${css.memRowArchived}` : ''}`,
    },
      h('div', { className: css.memRowMain },
        h('span', { className: css.memTitle },
          h('span', { className: css.kindBadge }, insightKindLabel(row.kind, t)),
          row.title || row.body),
        h('span', { className: css.memMeta },
          row.draft ? h('span', { className: `${css.badge} ${css.badgeDraft}` }, t('mem.draft')) : null,
          row.archived ? h('span', { className: `${css.badge} ${css.badgeArchived}` }, t('mem.archived')) : null,
          row.taskTitle ? h('span', { className: css.badge }, `@${row.taskTitle}`) : null,
          row.members !== undefined && row.members > 0 ? h('span', { className: css.badge }, `×${row.members}`) : null,
          row.confidence != null ? h('span', { className: css.badge }, `${Math.round(row.confidence * 100)}%`) : null,
          row.trigger && row.trigger.keywords.length > 0
            ? h('span', { className: css.badge }, `⚡${row.trigger.keywords.slice(0, 2).join(',')}`)
            : null)),
      row.body && row.body !== row.title
        ? h('div', { className: css.memBody }, String(row.body).slice(0, 160))
        : null,
      h('div', { className: css.memActs },
        scope !== 'task'
          ? h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => startEdit(row) }, t('mem.edit'))
          : null,
        scope === 'task' && !row.archived
          ? h('div', null,
              row.draft
                ? h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('confirm', row.id) } }, t('mem.confirm'))
                : null,
              h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('promote', row.id) } }, t('mem.promote')))
          : null,
        scope === 'project'
          ? h('div', null,
              h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('promote', row.id) } }, t('mem.promote')),
              h(Button, {
                variant: 'outline', size: 'sm',
                disabled: busy || !canDemoteToTask,
                title: showHints && !canDemoteToTask ? t('mem.needs-bound') : undefined,
                onClick: () => { void act('demote', row.id) },
              }, t('mem.demote')))
          : null,
        scope === 'global'
          ? h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('demote', row.id) } }, t('mem.demote'))
          : null,
        row.archived
          ? h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('restore', row.id) } }, t('mem.restore'))
          : h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('archive', row.id) } }, t('mem.archive')),
        h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void act('delete', row.id) } }, t('mem.delete'))))
  })

  // 增量加载哨兵 + 页脚。预取由上面的 IntersectionObserver 驱动（滚到底前 600px），
  /* 这里只负责：① 放哨兵；② 把"已显示 N / 总数"讲清楚，让无限滚动可预期；
     ③ 环境没有 IntersectionObserver 时退化成手动按钮，绝不静默停住。 */
  const footer = items.length > 0
    ? h('div', { className: css.memFooter },
        nextOffset !== null ? h('div', { ref: sentinelRef, className: css.memSentinel, 'aria-hidden': 'true' }) : null,
        nextOffset !== null && typeof IntersectionObserver === 'undefined'
          ? h(Button, {
              variant: 'outline', size: 'sm',
              disabled: loadingMore,
              onClick: () => { void loadRef.current(nextOffset, PAGE_SIZE, true) },
            }, t('mem.loadMore'))
          : null,
        h('span', { className: css.muted },
          progress.loaded < progress.total
            ? t('mem.progress', { loaded: progress.loaded, total: progress.total })
            : t('mem.allLoaded', { total: progress.total }),
          showSpinner && loadingMore ? ` · ${t('mem.loadingMore')}` : ''))
    : null

  return h('div', { className: css.memoryPane, ref: scrollRef },
    toolbar,
    newForm,
    errorBar,
    loading && !items.length ? h('div', { className: css.muted }, t('mem.loading')) : null,
    !loading && !error && items.length === 0 ? h('div', { className: css.muted }, t('mem.empty')) : null,
    h('div', { className: css.memList }, rowNodes, footer))
}
