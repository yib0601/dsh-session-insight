/**
 * dsh-turn-cost — Memory client half（项目记忆 UI）。
 *
 * 与 `client.js`（成本）+ `client.context.js`（上下文洞察）并列的第三个 client bundle：
 * 任务是面板/记忆列表/设置卡三种视图，与成本 UI 无交集，物理上独立更容易维护。
 * 同一 `__ModuleLoader__` 注册不同 id 是合法且并存的（宿主按 id 各自 apply）。
 *
 * 源码在 `client-memory-src/`（23 个模块，手写 createElement，无 JSX、无构建链）。
 * 这里只做一件事：把 ESM 模块图按 __ModuleLoader__ 的 factory/require 协议装配起来。
 *
 * HMR：宿主只 watch 声明的入口文件；改 `client-memory-src/` 内部后需 touch 本文件。
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-turn-cost',
  chunk: 'client.memory.js',
  factory(require) {
    // 宿主 seed 模块：与 client.js / client.context.js 同一套（react + ui-primitives）。
    const React = require('react');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    // 极简 ESM→factory 桥：模块表在下方按需填充，resolve 时静态解析相对路径。
    const __modules = {};
    const __cache = {};
    const __resolve = (from, spec) => {
      if (!spec.startsWith('.')) return spec;
      const parts = from.split('/').slice(0, -1);
      for (const seg of spec.split('/')) {
        if (seg === '.' || seg === '') continue;
        if (seg === '..') parts.pop();
        else parts.push(seg);
      }
      return parts.join('/');
    };
/**
 * 自动生成的模块表 —— 由 /tmp/build-memory-bundle.mjs 从 client-memory-src/ 转换而来。
 * 不要手改：改源码后重跑生成脚本。
 *
 * 每个条目是一个 factory(__exports, __req)，import 已转成 __req、export 已转成赋值。
 */
function __registerMemoryModules(__modules) {
    __modules["client-memory-src/MemoryView.js"] = function (__exports, __req) {
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
const { createElement: h, useCallback, useEffect, useRef, useState } = __req("react");
const { Button } = __req("@deepseek-ai/dsh-client-ui-primitives");
const { invokeCommand } = __req("./commands.js");
const { insightKindLabel } = __req("./kind-label.js");
const { HOST_PAGE_MAX, PAGE_SIZE, PREFETCH_MARGIN, SPINNER_DELAY_MS, appendUnique, createRequestGate, insightListLine, progressCounts } = __req("./paging.js");
const { parseInsightPayloadText, readInsightCache, writeInsightCache, invalidateInsightCache } = __req("./memory-load.js");
const { css } = __req("./styles.js");
function MemoryView({ ctx, sessionId, scope, root, boundTaskId, showHints, t }) {
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
    __exports.MemoryView = MemoryView;
    };

    __modules["client-memory-src/ShowTaskPanelNode.js"] = function (__exports, __req) {
/**
 * `show_task_panel` 工具调用的会话内视图 —— 它的作用就是**把面板打开**。
 *
 * 为什么这件事必须在这里做：面板的显示状态（closed / minimized）是**浏览器侧**的
 * （task-ui-store.js），宿主进程碰不到它。宿主侧原本写的是
 * `exec.ctx.events.emit('dsh:task-panel:show')`，而宿主契约里根本没有 `ctx`：
 *
 *   packages/core/tools/src/index.ts:418
 *   export interface ToolRunContext extends ToolExecution { deferContext(...); concludeTurn() }
 *
 * 于是那个工具每次都只返回「无法获取上下文」，面板从来不会打开 —— 插件里唯一的
 * 宿主命令之外，这是第二个"写了但没生效"的面（详见 CHANGELOG 0.5.14）。
 *
 * 正确的位置是宿主给出的扩展点：`ui-tool` 注册了 `conversation.chat.node`（key `tool-call`），
 * 其下有个按**工具名**分发的子槽 `tool.call.toolview`（契约原文：*Any name is allowed,
 * including tools registered by your package. Register with `key: '<tool name>'`*）。
 * 在这里认领 `show_task_panel` 这个 key，工具结果一渲染就把面板打开。
 *
 * 已由 .tsx 手写改写为 createElement 形式（原文件 54 行，零 JSX）。
 */
const { createElement, useEffect, useRef } = __req("react");
const { taskUIStore } = __req("./task-ui-store.js");
/**
 * 只在**现场执行**时打开面板。
 *
 * 历史节点在刷新 / 切换会话后挂载时会**直接**处于 `result` 阶段；现场调用则会先经过
 * `preparing` / `start`。这与 `/tasks` 命令节点用的判据同款（见 TaskCommandNode.js
 * 的 `live` ref）：刷新后只展示、不再开面板，否则每次打开会话都会弹一次面板。
 */
function ShowTaskPanelNode(props) {
  const phase = props?.phase
  const live = useRef(phase !== 'result')
  useEffect(() => {
    if (phase !== 'result' || !live.current) return
    live.current = false
    taskUIStore.actions.open()
  }, [phase])
  // 不渲染任何行：认领 key 会**替换**通用工具行，而这次调用的全部意义就是开面板，
  // 留一行"打开面板"的噪音不如让面板自己说话。
  return null
}

/** 把 `show_task_panel` 的视图注册进宿主的 `tool.call.toolview` 槽。 */
function registerShowTaskPanelView(slots, keep) {
  slots.inject('tool.call.toolview', () => {
    const off = slots.register(
      { name: 'tool.call.toolview', key: 'show_task_panel' },
      ShowTaskPanelNode,
    )
    if (typeof keep === 'function') keep(off)
  })
}
    __exports.ShowTaskPanelNode = ShowTaskPanelNode;
    __exports.registerShowTaskPanelView = registerShowTaskPanelView;
    };

    __modules["client-memory-src/TaskCommandNode.js"] = function (__exports, __req) {
/**
 * /tasks（含 /tasks insight …）与旧版 /task、/insight 节点的渲染器（conversation.chat.commandview）。
 * 列表型命令只显示一行摘要；记忆动作类只显示一句结果——
 * 目的：大 JSON 载荷绝不整段渲染进对话（否则切视图会刷屏）。
 *
 * 由 .tsx 手写改写为 createElement（原 92 行，5 处 JSX），CSS 复用原 hashed 类名。
 */
const { createElement: h, useEffect, useRef } = __req("react");
const { IconFolderOpenOutline16 } = __req("./icons.js");
const { parseTaskPayloadText, taskDataStore } = __req("./task-data-store.js");
const { parseInsightPayloadText } = __req("./memory-load.js");
const { taskUIStore } = __req("./task-ui-store.js");
const { cmdCss: css } = __req("./styles.js");
function TaskCommandNode({ node }) {
  const name = node?.name ?? 'task'
  const outcome = node?.outcome ?? null
  const args = typeof node?.args === 'string' ? node.args : ''
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const verb = tokens[0] ?? ''
  const sub = tokens[1] ?? ''
  const isTasks = name === 'tasks'
  // 合并后只有一个用户命令 /tasks：记忆列表是 `/tasks insight list …`，
  // 不能只按命令名判断——否则切一次记忆页就会留一行“已执行”节点。
  const isInsight = name === 'insight' || (isTasks && verb === 'insight')
  const insightVerb = name === 'insight' ? verb : sub
  const isList = isInsight
    ? (name === 'insight' ? (!verb || verb === 'list') : sub === 'list')
    : isTasks && !verb
  const text = outcome?.text ?? ''

  const parsedTasks = isInsight ? null : parseTaskPayloadText(text)
  const parsedInsights = isInsight ? parseInsightPayloadText(text) : null

  // 该节点是否“现场执行”（挂载时处于执行中）：为 true 说明是用户当场输入的命令，
  // 完成后同步数据并打开面板。刷新/切换会话后历史节点以完成态重挂载，
  // 此时只做展示、不再写数据/开面板（面板保持关闭，与“刷新后不显示”一致）。
  const live = useRef(outcome === null)

  // 载荷进数据 store；列表型任务命令（/tasks、无动词 /task）同步数据并打开面板
  useEffect(() => {
    if (!parsedTasks || !live.current) return
    taskDataStore.actions.setTasks({
      tasks: parsedTasks.tasks,
      boundTaskId: parsedTasks.boundId,
      archivedCount: parsedTasks.archived,
      root: parsedTasks.root,
    })
    if (isList) taskUIStore.actions.open()
  }, [text])

  if (outcome === null) {
    return h('div', { className: css.row, 'data-variant': 'running' }, `/${name} 执行中…`)
  }

  if (outcome.kind === 'error') {
    const brief = String(text ?? '').split('\n')[0].slice(0, 120)
    return h('div', { className: css.row, 'data-variant': 'error' },
      `/${name} 失败${brief ? `：${brief}` : ''}`)
  }

  // 列表型命令是**面板自己的读通道**，不是对话内容：宿主每次 execute 都会写
  // command/run + command/done，客户端唯一能抑制的就是这里的渲染。载荷已同步进 store
  // （/tasks 还会打开面板），再留一行只会让切页/刷新在会话里堆节点。
  // 解析失败时保留一行，避免"命令成功了却什么都不显示"。
  if (isList && (isInsight ? parsedInsights : parsedTasks)) return null

  // 记忆动作：只显示一句结果（永不整段渲染）。新命令是 /tasks insight …，
  // 旧会话里仍可能留着 name='insight' 的节点。
  if (isInsight) {
    const note = String(text ?? '').split('\n')[0].slice(0, 120)
    const label = name === 'insight' ? '/insight' : '/tasks insight'
    return h('div', { className: css.row, 'data-variant': 'ok' },
      `${label} ${insightVerb} ${note || '已完成'}`)
  }

  if (!isList) {
    const note = String(text ?? '')
      .split(/\n{2,}/)[0]
      .replace(/```.*$/s, '')
      .trim()
      .slice(0, 200)
    return h('div', { className: css.row, 'data-variant': 'ok' }, `/${name} ${note || '已完成'}`)
  }

  const count = parsedTasks ? parsedTasks.tasks.length : 0
  const archived = parsedTasks ? parsedTasks.archived : 0
  const label = parsedTasks
    ? `任务 ${count} 套${archived ? `（归档 ${archived}）` : ''} · 已同步到任务面板`
    : `/${name} 已执行`
  return h('div', { className: css.row, 'data-variant': 'ok' },
    h(IconFolderOpenOutline16, { className: css.icon }),
    h('span', null, label))
}
    __exports.TaskCommandNode = TaskCommandNode;
    };

    __modules["client-memory-src/TaskComponents.js"] = function (__exports, __req) {
/**
 * Task Panel Presentational 组件 — MiniBar（折叠迷你条）与 TaskCard（任务卡）。
 * 纯渲染 + 卡片局部行内编辑/拖拽状态，动作经 props 回调交给容器（TaskPanel.js）。
 *
 * 由 .tsx 手写改写为 createElement（原 496 行 / 96 处 JSX）。
 * CSS 复用原 hashed 类名映射（styles.js），视觉与原包一致。
 */
const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = __req("react");
const { Button } = __req("@deepseek-ai/dsh-client-ui-primitives");
const { IconChevronDownOutline14, IconChevronUpOutline14, IconCheckOutline16, IconPlayOutline16, IconFolderOpenOutline16 } = __req("./icons.js");
const { insightKindLabel } = __req("./kind-label.js");
const { useTaskDrag } = __req("./task-hooks.js");
const { timeAgo } = __req("./relative-time.js");
const { css } = __req("./styles.js");
/** 步骤状态图标。 */
function StepIcon({ status }) {
  if (status === 'completed') return h(IconCheckOutline16, { className: css.stepDone })
  if (status === 'in_progress') return h(IconPlayOutline16, { className: css.stepRun })
  return h('span', { className: css.stepPending })
}

/**
 * 双击判定窗口（ms）。
 * 单击（如卡片展开/收起）会延迟该时长执行：若期间收到第二次点击则按“双击”处理并取消单击，
 * 从而避免“第一下先展开/收起、布局位移后第二下点不到目标”的问题。
 * 数值是可感知与可靠性的折中：太小慢速双击会失效，太大单击会显“肉”。
 */
const CLICK_SINGLE_DELAY_MS = 250

/**
 * 行内自适应高度文本编辑器（textarea）。
 * 编辑体验与单行输入一致（Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交），
 * 但高度随内容自动增长（按实际渲染行高测量），最多 maxRows 行后内部滚动，
 * 解决长步骤/长任务名只能挤在一行里横向滚动编辑的问题。
 */
function InlineEditor({ value, className, maxRows = 8, disabled = false, onValueChange, onCommit, onCancel }) {
  const ref = useRef(null)

  // 在绘制前按真实内容测量并写死高度：内容 <= maxRows 行时刚好包住，超出后内部滚动。
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const cs = getComputedStyle(el)
    const lineHeight = parseFloat(cs.lineHeight) || 20
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const borderV = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
    const cap = maxRows * lineHeight + padV + borderV
    const height = Math.min(el.scrollHeight, cap)
    el.style.height = `${height}px`
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden'
  }, [value, maxRows])

  return h('textarea', {
    ref,
    className,
    rows: 1,
    value,
    autoFocus: true,
    disabled,
    spellCheck: false,
    onChange: (e) => onValueChange(e.target.value),
    onFocus: (e) => {
      // 光标放到末尾，便于直接在原文后继续输入
      const len = e.target.value.length
      e.target.setSelectionRange(len, len)
    },
    onBlur: onCommit,
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onCommit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
  })
}

/** 折叠态迷你条（可拖拽、单击展开）。 */
function MiniBar({ label, hint, showHints, position, theme, onMove, open }) {
  const barRef = useRef(null)
  const down = useRef(null)

  const onMouseDown = (e) => {
    if (e.button !== 0) return
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    down.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY, moved: false }
    const onMoveEv = (ev) => {
      const d = down.current
      if (!d) return
      if (!d.moved && Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 4) d.moved = true
      if (d.moved) {
        const w = barRef.current?.offsetWidth ?? 260
        const height = barRef.current?.offsetHeight ?? 34
        const x = Math.max(8, Math.min(window.innerWidth - w - 8, ev.clientX - d.dx))
        const y = Math.max(8, Math.min(window.innerHeight - height - 8, ev.clientY - d.dy))
        onMove({ x, y })
      }
    }
    const onUpEv = () => {
      const d = down.current
      down.current = null
      window.removeEventListener('mousemove', onMoveEv)
      window.removeEventListener('mouseup', onUpEv)
      if (d && !d.moved) open()
    }
    window.addEventListener('mousemove', onMoveEv)
    window.addEventListener('mouseup', onUpEv)
  }

  return h('div', {
    ref: barRef,
    className: css.miniBar,
    style: { left: position.x, top: position.y },
    'data-theme': theme === 'native' ? undefined : theme,
    onMouseDown,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
    role: 'button',
    tabIndex: 0,
    title: showHints ? hint : undefined,
    'aria-label': hint,
  },
    h(IconFolderOpenOutline16, { className: css.miniIcon }),
    h('span', { className: css.miniText }, label),
    h(IconChevronUpOutline14, { className: css.miniChevron }))
}

/** 任务卡：头部（单击展开/双击改名）+ 进度条 + 展开体（步骤、文件、记忆、动作）。 */
function TaskCard({
  task, isBound, expanded, onToggleExpand, onSwitch, onUnbind, onArchive,
  onRename, onEditStep, onCycleStatus, onReorderSteps, onInsightAction,
  showHints, syncing, t,
}) {
  const steps = task.steps || []
  const { dragState, dropTargetIndex, startDrag, cancelDrag } = useTaskDrag(task.id, isBound, onReorderSteps)

  // 行内编辑状态（本卡片局部）：双击进入，Enter/失焦提交，Esc 取消。
  const [stepEdit, setStepEdit] = useState(null)
  const [titleEdit, setTitleEdit] = useState(null)

  const done = steps.filter((s) => s.status === 'completed').length
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0

  const commitStepEdit = (index) => {
    if (!stepEdit || stepEdit.index !== index) return
    // 同步中提交会被 withLock 静默丢掉；保留编辑态，等这轮结束再让用户提交。
    if (syncing) return
    const value = stepEdit.value
    setStepEdit(null)
    onEditStep(index, value)
  }

  const commitTitleEdit = () => {
    if (titleEdit === null) return
    if (syncing) return
    const value = titleEdit.value
    setTitleEdit(null)
    onRename(value)
  }

  // —— 卡片头单击(展开/收起)与双击(编辑任务名)的时序判定 ——
  // 单击动作延迟 CLICK_SINGLE_DELAY_MS 执行；若在窗口内收到第二次点击，取消单击、
  // 命中任务名则直接进入编辑，避免“第一下已展开/收起、布局位移、第二下点不到任务名”。
  const headClickTimer = useRef(null)
  // 编辑状态下，点卡片头任意处会先触发失焦提交；该次点击不应再当作“切换展开”的单击。
  const suppressHeadClick = useRef(false)
  useEffect(() => () => {
    if (headClickTimer.current !== null) window.clearTimeout(headClickTimer.current)
  }, [])

  const handleHeadClick = (e) => {
    if (suppressHeadClick.current) {
      // 上一次 mousedown 落在标题编辑框内（失焦提交产生），吞掉这次点击，不切换展开
      suppressHeadClick.current = false
      return
    }
    if (titleEdit !== null) return
    const target = e.target
    const onTitle = isBound && target.closest('[data-card-title]') !== null
    if (headClickTimer.current !== null) {
      // 第二次点击 → 双击：取消待执行的单击动作
      window.clearTimeout(headClickTimer.current)
      headClickTimer.current = null
      if (onTitle) setTitleEdit({ value: String(task.title ?? '') })
      else onToggleExpand()
      return
    }
    headClickTimer.current = window.setTimeout(() => {
      headClickTimer.current = null
      onToggleExpand()
    }, CLICK_SINGLE_DELAY_MS)
  }

  const head = h('div', {
    className: css.cardHead,
    role: 'button',
    tabIndex: 0,
    onClick: handleHeadClick,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleHeadClick(e)
      }
    },
    onMouseDownCapture: () => {
      // 标题编辑中，点击卡片头任意处都会先失焦提交；标记该次点击以在 onClick 中吞掉，
      // 避免“改名提交一下、卡片又收起/展开一下”的误切换。
      if (titleEdit !== null) suppressHeadClick.current = true
    },
    onDoubleClick: (e) => e.preventDefault(),
    'aria-expanded': expanded,
  },
    h('div', { className: css.cardTitleRow },
      isBound ? h('span', { className: css.boundBadge }, t('task.current')) : null,
      isBound && titleEdit !== null
        ? h(InlineEditor, {
            className: css.editorArea,
            value: titleEdit.value,
            maxRows: 4,
            disabled: syncing,
            onValueChange: (value) => setTitleEdit({ value }),
            onCommit: commitTitleEdit,
            onCancel: () => setTitleEdit(null),
          })
        : h('span', {
            'data-card-title': true,
            className: `${css.cardTitle}${isBound ? ` ${css.cardTitleEditable}` : ''}`,
            title: isBound && showHints ? t('task.title-edit') : undefined,
            onDoubleClick: (e) => {
              e.preventDefault()
              e.stopPropagation()
              if (isBound && !syncing) setTitleEdit({ value: String(task.title ?? '') })
            },
          }, task.title)),
    h('div', { className: css.cardMeta },
      steps.length > 0 ? h('span', { className: css.progressText }, `${done}/${steps.length}`) : null,
      h('span', { className: css.updated }, timeAgo(task.updatedAt || task.lastActiveAt, '')),
      h('span', { className: css.chevron },
        expanded ? h(IconChevronUpOutline14, null) : h(IconChevronDownOutline14, null))))

  const track = steps.length > 0
    ? h('div', { className: css.track },
        h('div', { className: css.trackFill, style: { width: `${pct}%` } }))
    : null

  const stepRows = steps.map((step, i) => {
    const stepIsEditing = stepEdit !== null && stepEdit.index === i
    const stepIsDragging = dragState?.dragging && dragState.fromIndex === i
    const isDropTarget = dropTargetIndex === i
    const isDropTargetAfter = dropTargetIndex === i + 1
    const rowClass = `${css.stepRow}${stepIsDragging ? ` ${css.stepDragging}` : ''}`
      + `${isDropTarget ? ` ${css.dropTargetBefore}` : ''}`
      + `${isDropTargetAfter ? ` ${css.dropTargetAfter}` : ''}`
    const contentClass = `${css.stepContent}`
      + `${step.status === 'completed' ? ` ${css.stepContentDone}` : ''}`
      + `${step.status === 'in_progress' ? ` ${css.stepContentRun}` : ''}`
      + `${isBound ? ` ${css.stepEditable}` : ''}`

    return h('li', {
      key: i,
      'data-step-row': true,
      className: rowClass,
      onMouseDown: (e) => {
        if (e.button !== 0) return
        if (!isBound || syncing) return
        // 交互控件（状态图标、编辑输入框等）上不进入拖拽
        const el = e.target
        if (el.closest('button, input, textarea, a')) return
        startDrag(i, step.content, e)
      },
    },
      isBound
        ? h('button', {
            type: 'button',
            className: css.stepToggle,
            disabled: syncing,
            onClick: (e) => { e.stopPropagation(); onCycleStatus(i) },
            title: showHints ? `${t('step.completed')}/${t('step.in-progress')}/${t('step.pending')}` : undefined,
          }, h(StepIcon, { status: step.status }))
        : h(StepIcon, { status: step.status }),
      stepIsEditing
        ? h(InlineEditor, {
            className: css.editorArea,
            value: stepEdit.value,
            maxRows: 10,
            disabled: syncing,
            onValueChange: (value) => setStepEdit({ index: i, value }),
            onCommit: () => commitStepEdit(i),
            onCancel: () => setStepEdit(null),
          })
        : h('span', {
            className: contentClass,
            title: isBound && showHints ? t('step.edit-hint') : undefined,
            onDoubleClick: (e) => {
              e.stopPropagation()
              if (isBound && !syncing) setStepEdit({ index: i, value: String(step.content ?? '') })
            },
          }, step.content))
  })

  const dragGhost = dragState && dragState.dragging
    ? h('div', {
        className: css.dragGhost,
        style: { left: dragState.clientX + 12, top: dragState.clientY - 20 },
      },
        h('div', { className: css.dragGhostCard },
          h('span', { className: css.dragGhostContent }, dragState.stepContent),
          h('button', {
            type: 'button',
            className: css.dragGhostClose,
            style: { pointerEvents: 'auto' },
            onClick: (e) => { e.stopPropagation(); cancelDrag() },
            title: showHints ? t('drag.cancel') : undefined,
            'aria-label': t('drag.cancel'),
          }, '×')))
    : null

  const stepsSection = h('div', { className: css.section },
    h('div', { className: css.sectionLabel },
      t('task.steps'),
      steps.length > 0 ? h('span', { className: css.sectionCount }, steps.length) : null),
    steps.length > 0
      ? h('div', null,
          h('ol', { className: css.stepsList }, stepRows),
          dragGhost)
      : h('div', { className: css.muted }, t('panel.empty-desc')))

  const filesSection = (task.files?.length ?? 0) > 0
    ? h('div', { className: css.section },
        h('div', { className: css.sectionLabel },
          t('task.files'),
          h('span', { className: css.sectionCount }, task.files.length)),
        h('ul', { className: css.filesList },
          task.files.slice(0, 12).map((file, i) => h('li', { key: i },
            h('button', {
              className: css.fileRow,
              onClick: () => navigator.clipboard?.writeText(file.path),
              title: showHints
                ? `${t('file.copy')}: ${file.path}${file.line ? `:${file.line}` : ''}`
                : undefined,
            },
              h('span', { className: css.fileDot }),
              h('span', { className: css.filePath }, file.path),
              file.line ? h('span', { className: css.fileLine }, `:${file.line}`) : null))),
          (task.files?.length ?? 0) > 12
            ? h('li', { className: css.muted }, `… 共 ${task.files.length} 个`)
            : null))
    : null

  const insightsSection = onInsightAction && Array.isArray(task.insights) && task.insights.length > 0
    ? h('div', { className: css.section },
        h('div', { className: css.sectionLabel },
          t('mem.section-label'),
          h('span', { className: css.sectionCount }, task.insights.length)),
        h('ul', { className: css.memList },
          task.insights.map((ins) => h('li', { key: ins.id, className: css.memRow },
            h('div', { className: css.memTitle },
              h('span', { className: css.kindBadge }, insightKindLabel(ins.kind, t)),
              h('span', null, ins.title || ins.id),
              ins.draft ? h('span', { className: `${css.badge} ${css.badgeDraft}` }, t('mem.draft')) : null),
            h('div', { className: css.memActs },
              ins.draft
                ? h(Button, { variant: 'outline', size: 'sm', disabled: syncing, onClick: () => onInsightAction('confirm', ins.id) }, t('mem.confirm'))
                : null,
              h(Button, { variant: 'outline', size: 'sm', disabled: syncing, onClick: () => onInsightAction('promote', ins.id) }, t('mem.promote')),
              h(Button, { variant: 'outline', size: 'sm', disabled: syncing, onClick: () => onInsightAction('delete', ins.id) }, t('mem.delete')))))))
    : null

  const footer = h('div', { className: css.cardFooter },
    h(Button, { variant: 'outline', size: 'sm', disabled: isBound || syncing, onClick: onSwitch }, t('task.switch')),
    isBound
      ? h(Button, { variant: 'outline', size: 'sm', disabled: syncing, onClick: onUnbind, title: showHints ? t('task.unbind') : undefined }, t('task.unbind'))
      : null,
    h(Button, { variant: 'outline', size: 'sm', disabled: syncing, onClick: onArchive }, t('task.archive')))

  const body = expanded
    ? h('div', { className: css.cardBody }, stepsSection, filesSection, insightsSection, footer)
    : null

  return h('article', {
    'data-task-id': task.id,
    className: `${css.card}${isBound ? ` ${css.cardBound}` : ''}`,
  }, head, track, body)
}
    __exports.MiniBar = MiniBar;
    __exports.TaskCard = TaskCard;
    };

    __modules["client-memory-src/TaskPanel.js"] = function (__exports, __req) {
/**
 * Task Panel — dsh web `shell.overlay` 浮动任务面板。
 * Container 组件：负责数据获取、命令桥接、状态协调
 * Presentational 组件在 TaskComponents.js
 *
 * 由 .tsx 手写改写为 createElement（原 444 行 / 59 处 JSX）。
 */
const { Component, createElement: h, useEffect, useRef, useState } = __req("react");
const { Button } = __req("@deepseek-ai/dsh-client-ui-primitives");
const { IconChevronDownOutline14, IconCloseOutline16, IconFolderOpenOutline16, IconQuestionOutline14 } = __req("./icons.js");
const { translatorFor } = __req("./i18n.js");
const { invokeCommand } = __req("./commands.js");
const { missingServices, service } = __req("./services.js");
const { useTaskData, useTaskDataActions, parseTaskPayloadText } = __req("./task-data-store.js");
const { useTaskUI, useTaskUIActions, PANEL_VIEWS } = __req("./task-ui-store.js");
const { MiniBar, TaskCard } = __req("./TaskComponents.js");
const { MemoryView } = __req("./MemoryView.js");
const { invalidateInsightCache } = __req("./memory-load.js");
const { pickSessionId } = __req("./session-id.js");
const { css } = __req("./styles.js");
const STATUS_CYCLE = ['pending', 'in_progress', 'completed']
// 视图列表的唯一事实来源在 UI store（`/` 菜单那三行也读它）；这里不再抄一份。
const VIEW_CYCLE = PANEL_VIEWS

function useSessionId(ctx) {
  const [, force] = useState(0)
  useEffect(() => {
    const list = service(ctx, 'sessions')?.list
    if (!list || typeof list.subscribe !== 'function') return
    return list.subscribe(() => force((n) => n + 1))
  }, [ctx])
  // 快照结构在 dsh 0.1.7 变过（current/items → ids/byId）：解析与兼容都在 session-id.js，
  // 那里有单测；这里只负责订阅与取值。
  return pickSessionId(service(ctx, 'sessions')?.list?.getSnapshot?.())
}

/** 渲染崩溃兜底：面板崩了也不能把整个 shell 拖下水。 */
class PanelErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    console.warn('[dsh-project-memory] task panel render crashed:', error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return h('button', {
      className: css.boundaryFallback,
      onClick: () => this.setState({ failed: false }),
      title: '重新渲染任务面板',
    }, '任务面板（点击重试）')
  }
}

function TaskPanelEntry({ ctx }) {
  return h(PanelErrorBoundary, null, h(TaskPanelView, { ctx }))
}

function TaskPanelView({ ctx }) {
  const t = translatorFor(ctx)
  const data = useTaskData()
  const ui = useTaskUI()
  // 缺失的客户端服务：面板照常挂载，但必须把原因摆在界面上（否则用户看到的是
  // "面板在、数据永远同步失败"这种没有因果的二次困惑）。
  const degraded = missingServices(ctx)
  const sessionId = useSessionId(ctx)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  // 切会话时旧 /tasks 可能仍在飞：锁不能把新会话的刷新一起吞掉，排队到锁释放后补发。
  const pendingRefreshRef = useRef(false)
  // 响应必须按**发起时**的会话判定，旧闭包里的 sessionId 不能覆盖新会话的数据。
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const [syncedAt, setSyncedAt] = useState(0)
  const [syncError, setSyncError] = useState(null)
  // 提示信息开关落在 UI store（持久化）：关掉后面板内所有悬停 title 气泡都不再弹出。
  const showHints = ui.showHints
  const dataActions = useTaskDataActions()
  const uiActions = useTaskUIActions()
  // 视图页同样落在 UI store：`/` 菜单的三行是"打开某一页"，它们必须能从这个组件外面切页。
  const view = ui.view
  const cycleView = () => {
    const i = VIEW_CYCLE.indexOf(view)
    uiActions.setView(VIEW_CYCLE[(i + 1) % VIEW_CYCLE.length])
  }
  const viewTitle =
    view === 'task' ? t('panel.title')
      : view === 'global' ? t('view.global')
        : t('view.project')

  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const activeTasks = tasks.filter((task) => !task.archived)
  const boundTask = data.boundTaskId ? tasks.find((task) => task.id === data.boundTaskId) ?? null : null

  const applyPayload = (text, requestSessionId) => {
    // 旧会话的响应不得落到新会话：applyPayload 是旧闭包，sessionId 也已过期。
    if (requestSessionId !== sessionIdRef.current) return false
    const parsed = parseTaskPayloadText(text)
    if (!parsed) return false
    dataActions.setTasks({ tasks: parsed.tasks, boundTaskId: parsed.boundId, archivedCount: parsed.archived, root: parsed.root, sessionId })
    setSyncedAt(Date.now())
    setSyncError(null)
    return true
  }

  const runLine = async (line) => {
    const result = await invokeCommand(ctx, sessionId, line)
    if (!result.ok) {
      setSyncError(result.error === 'no-channel' ? t('panel.no-channel') : (result.error || t('panel.sync-failed')))
      return false
    }
    return applyPayload(result.text, sessionId)
  }

  // 锁用 ref 而不是渲染快照里的 state：同一 tick 的两次触发也能被挡住。
  const withLock = async (fn) => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await fn()
    } finally {
      syncingRef.current = false
      setSyncing(false)
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        refreshRef.current()
      }
    }
  }

  /**
   * 只取数据，**不**顺手 switch。
   *
   * 旧实现在这里补一次 `/tasks switch <boundId>`（条件是"新 boundId 与内存里的不同"），
   * 意图是刷新后让宿主 todo 跟随绑定任务。但那是多余的：宿主的 todo 清单是
   * `sessionProjections` 里的 `todos` 单元（由 `todo/write` 事件折叠而来），重启/换标签页
   * 都会从会话日志重建，不需要谁再推一次；而 switch 会 `session.append('todo/write')`，
   * 于是"打开面板/切一次会话"就写一次会话历史（还顺手刷新任务的 lastActiveAt）。
   * 真正的绑定动作都有明确入口：`select_task`、`/tasks switch`、面板卡片的切换按钮，
   * 它们各自会推宿主清单（adoptStepsToSession），不需要巡检式补写。
   */
  const refresh = async () => {
    if (syncingRef.current) {
      pendingRefreshRef.current = true
      return
    }
    await withLock(() => runLine('/tasks'))
  }

  const handleAction = async (verb, taskId) => {
    await withLock(() => runLine(`/tasks ${verb} ${taskId}`))
  }

  // v0.5：任务卡内联记忆动作（confirm/promote/delete 于任务层），随后刷新任务数据
  const handleInsightTask = async (action, id) => {
    await withLock(async () => {
      // 动作失败时不要用随后的 /tasks 成功把错误清掉（用户会看到“点了没反应”）。
      const ok = await runLine(`/tasks insight ${action} task ${id}`)
      if (!ok) return
      // 记忆页的 30s 缓存不知道任务卡里刚改过条目；不失效会显示旧行（甚至已删除的行）。
      invalidateInsightCache(sessionId, data.root ?? null)
      await runLine('/tasks')
    })
  }

  const cycleStatus = (taskId, index) => {
    const task = data.tasks.find((tt) => tt.id === taskId)
    if (!task) return
    const cur = STATUS_CYCLE.indexOf((task.steps || [])[index]?.status)
    const next = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length]
    void withLock(() => runLine(`/tasks step ${taskId} ${index} ${next}`))
  }

  const commitStepText = (taskId, index, value) => {
    const task = data.tasks.find((tt) => tt.id === taskId)
    const trimmed = value.trim()
    if (!task) return
    const same = (task.steps || [])[index]?.content === trimmed
    if (same || !trimmed) return
    void withLock(() => runLine(`/tasks step-text ${taskId} ${index} ${JSON.stringify(trimmed)}`))
  }

  const reorderSteps = (taskId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const task = data.tasks.find((tt) => tt.id === taskId)
    if (!task) return
    // 服务端按拖拽的 from/to 自己算落点；这里不再回写整份数组。
    void withLock(() => runLine(`/tasks step-move ${taskId} ${fromIndex} ${toIndex}`))
  }

  const commitTitle = (taskId, value) => {
    const task = data.tasks.find((tt) => tt.id === taskId)
    const trimmed = value.trim()
    if (!task) return
    const same = task.title === trimmed
    if (same || !trimmed) return
    void withLock(() => runLine(`/tasks rename ${taskId} ${JSON.stringify(trimmed)}`))
  }

  const expand = () => {
    uiActions.open()
    if (Date.now() - Math.max(data.lastUpdate, syncedAt) > 5_000) {
      void refresh()
    }
  }

  const THEMES = ['native', 'glass', 'brutal', 'mono']
  const style = THEMES.includes(ui.theme) ? ui.theme : 'native'
  const styleLabel = t(`style.${style}`)
  const cycleTheme = () => {
    const i = THEMES.indexOf(style)
    uiActions.setTheme(THEMES[(i + 1) % THEMES.length])
  }

  const panelRef = useRef(null)
  const drag = useRef(null)
  // 拖动期间位置只进本地 state；mouseup 才写 UI store（否则每个 mousemove 都同步写 localStorage）。
  const [dragPos, setDragPos] = useState(null)
  const dragPosRef = useRef(null)

  const handleDragStart = (e) => {
    if (e.target !== e.currentTarget) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const onMove = (ev) => {
      if (!drag.current) return
      const width = panelRef.current?.offsetWidth ?? 380
      const x = Math.max(8, Math.min(window.innerWidth - width - 8, ev.clientX - drag.current.dx))
      const y = Math.max(8, Math.min(window.innerHeight - 64, ev.clientY - drag.current.dy))
      dragPosRef.current = { x, y }
      setDragPos({ x, y })
    }
    const onUp = () => {
      drag.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (dragPosRef.current) uiActions.setPanelPosition(dragPosRef.current)
      dragPosRef.current = null
      setDragPos(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // 面板打开/切页时补一次数据。记忆页也发：它要 `boundTaskId`（降级按钮）与 `root`
  // 都从 `/tasks` 载荷来，只在任务页发会让记忆页拿到 null，降级按钮永远禁用。
  // 命令节点本身由 TaskCommandNode 隐藏，所以这次补数据不会在对话里留下可见行。
  const refreshRef = useRef(() => {})
  refreshRef.current = () => { void refresh() }
  // 记住这份数据属于哪个会话：切会话必须无条件刷新，不能被 5s 节流吞掉一次后永久显示旧项目。
  const syncedSessionRef = useRef(null)
  useEffect(() => {
    if (ui.closed || !sessionId) return
    if (syncedSessionRef.current !== sessionId) {
      syncedSessionRef.current = sessionId
      dataActions.reset()
      refreshRef.current()
      return
    }
    if (Date.now() - Math.max(data.lastUpdate, syncedAt) < 5_000) return
    refreshRef.current()
  }, [ui.closed, ui.view, sessionId])

  // 彻底隐藏：不渲染任何东西
  if (ui.closed) {
    return null
  }

  // 折叠态：迷你条
  if (ui.minimized) {
    const label = boundTask
      ? `${t('minibar.current')}: ${boundTask.title}`
      : activeTasks.length > 0
        ? `${t('minibar.current')}: ${activeTasks.length} ${t('minibar.tasks')}`
        : t('minibar.no-task')
    return h(MiniBar, {
      label,
      hint: t('minibar.click-expand'),
      showHints,
      position: ui.panelPosition,
      theme: style,
      onMove: uiActions.setPanelPosition,
      open: expand,
    })
  }

  const doneCount = activeTasks.filter((task) => {
    const steps = task.steps || []
    // 载荷在 >50 步时被截断：必须用服务端总量判断，否则“前 50 步都完成”会误显示为整单完成。
    const totalSteps = task.totals?.steps ?? steps.length
    const done = task.totals?.completedSteps ?? steps.filter((s) => s.status === 'completed').length
    return totalSteps > 0 && done === totalSteps
  }).length

  // 视图循环图标（lucide notebook-tabs）
  const cycleIcon = h('svg', {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
    h('path', { d: 'M2 6h4' }),
    h('path', { d: 'M2 10h4' }),
    h('path', { d: 'M2 14h4' }),
    h('path', { d: 'M2 18h4' }),
    h('rect', { width: 16, height: 20, x: 4, y: 2, rx: 2 }),
    h('path', { d: 'M15 2v20' }),
    h('path', { d: 'M15 7h5' }),
    h('path', { d: 'M15 12h5' }),
    h('path', { d: 'M15 17h5' }))

  const header = h('header', { className: css.header },
    h('div', { className: css.headerLeft },
      h(Button, {
        type: 'button',
        className: css.headerIconBtn,
        onClick: cycleTheme,
        title: showHints ? styleLabel : undefined,
        'aria-label': styleLabel,
      }, h(IconFolderOpenOutline16, { className: css.headerIcon })),
      h('h2', { className: css.headerTitle }, viewTitle)),
    h('div', { className: css.headerRight },
      h(Button, {
        variant: 'ghost',
        size: 'sm',
        onClick: cycleView,
        'aria-label': t('view.cycle'),
        title: showHints
          ? `${t('view.cycle')}（${view} → ${VIEW_CYCLE[(VIEW_CYCLE.indexOf(view) + 1) % VIEW_CYCLE.length]}）`
          : undefined,
      }, cycleIcon),
      view === 'task'
        ? h('span', { className: css.counts },
            activeTasks.length > 0 ? `${t('panel.active')} ${activeTasks.length} · ${doneCount}/${activeTasks.length}` : '')
        : null,
      h(Button, {
        variant: 'ghost',
        size: 'sm',
        className: showHints ? undefined : css.hintsOff,
        onClick: () => uiActions.toggleHints(),
        'aria-pressed': !showHints,
        'aria-label': showHints ? t('panel.hints-off') : t('panel.hints-on'),
        title: showHints ? t('panel.hints-off') : t('panel.hints-on'),
      }, h(IconQuestionOutline14, { size: 16 })),
      h(Button, {
        variant: 'ghost', size: 'sm',
        onClick: () => uiActions.minimize(),
        'aria-label': t('panel.minimize'),
        title: showHints ? t('panel.minimize') : undefined,
      }, h(IconChevronDownOutline14, null)),
      h(Button, {
        variant: 'ghost', size: 'sm',
        onClick: () => uiActions.close(),
        'aria-label': t('panel.close'),
        title: showHints ? t('panel.close') : undefined,
      }, h(IconCloseOutline16, null))))

  const notices = [
    degraded.length > 0
      ? h('div', { key: 'degraded', className: css.notice }, t('panel.degraded', { names: degraded.join(', ') }))
      : null,
    // 会话服务本身缺失时，"还没有会话"是误导：上面那行的降级说明才是原因。
    !sessionId && service(ctx, 'sessions') !== undefined
      ? h('div', { key: 'nosession', className: css.notice }, t('panel.no-session'))
      : null,
    syncError
      ? h('div', { key: 'syncerr', className: css.notice }, `${t('panel.sync-failed')}: ${syncError}`)
      : null,
  ]

  const content = view !== 'task'
    ? h(MemoryView, {
        ctx, sessionId, scope: view, root: data.root ?? null,
        boundTaskId: data.boundTaskId, showHints, t,
      })
    : activeTasks.length === 0
      ? h('div', { className: css.emptyState },
          h('p', { className: css.emptyTitle }, t('panel.empty')),
          h('p', { className: css.emptyDesc }, t('panel.empty-desc')),
          syncing ? h('p', { className: css.syncHint }, t('panel.syncing')) : null)
      : h('div', { className: css.taskList },
          activeTasks.map((task) => h(TaskCard, {
            key: task.id,
            task,
            isBound: data.boundTaskId === task.id,
            expanded: ui.expandedTaskIds.includes(task.id),
            onToggleExpand: () => uiActions.toggleTaskExpanded(task.id),
            onSwitch: () => handleAction('switch', task.id),
            onUnbind: () => runLine('/tasks unbind'),
            onArchive: () => handleAction('archive', task.id),
            onRename: (value) => commitTitle(task.id, value),
            onEditStep: (index, value) => commitStepText(task.id, index, value),
            onCycleStatus: (index) => cycleStatus(task.id, index),
            onReorderSteps: (from, to) => reorderSteps(task.id, from, to),
            onInsightAction: (action, id) => { void handleInsightTask(action, id) },
            showHints,
            syncing,
            t,
          })),
          syncing ? h('div', { className: css.syncHint }, t('panel.syncing')) : null)

  return h('div', {
    className: css.panel,
    ref: panelRef,
    style: { left: (dragPos ?? ui.panelPosition).x, top: (dragPos ?? ui.panelPosition).y },
    'data-theme': style === 'native' ? undefined : style,
  },
    h('div', {
      className: css.dragHandle,
      onMouseDown: handleDragStart,
      title: showHints ? t('task.drag') : undefined,
    }, h('div', { className: css.handleGrip })),
    header,
    notices,
    content)
}
    __exports.TaskPanelEntry = TaskPanelEntry;
    };

    __modules["client-memory-src/client.js"] = function (__exports, __req) {
/**
 * dsh-project-memory Client Entry
 *
 * dsh web (rc.1) 的 client 插件契约为 cordis client plugin：
 *   export const inject = [<client 服务名>...]
 *   export function apply(ctx) { ... }
 *
 * 本插件**不用顶层 `inject` 声明必需服务**（见 services.ts）：它是装配期门控，缺一项宿主
 * 就根本不调用 apply()，表现是"插件出问题、界面上却静默消失"。服务改由 `service()` 现场探测，
 * 缺了照常挂载、面板上显示原因、日志里打一条点名缺失项的告警。
 *
 * 面板注册进 `shell.overlay`（Frame 级浮动层，additive 列表槽）：
 * 该槽由 ui-layout 的 AppFrame 声明渲染（scope root，独立于滚动容器），
 * 默认 click-through，条目自身需开启 pointer-events。
 *
 * 只依赖宿主 seed 提供的模块（react / dsh-client-ui-primitives），
 * 数据经 remote.commands.execute 执行 /tasks 命令获取 JSON 快照。
 *
 * 另有一个可选增强：自建的 `/` 菜单源（slash.ts），把三条命令收进一个带图标和
 * 小节标题的「工作流」组。它**整体是可选的**——宿主没有 slash 触发器服务时静默跳过。
 */
const { createElement } = __req("react");
const { TaskPanelEntry } = __req("./TaskPanel.js");
const { TaskCommandNode } = __req("./TaskCommandNode.js");
const { registerShowTaskPanelView } = __req("./ShowTaskPanelNode.js");
const { taskUIStore } = __req("./task-ui-store.js");
const { createSlashSource } = __req("./slash.js");
const { DEGRADED_GRACE_MS, later, missingServices, service } = __req("./services.js");
const { registerSettingsCard } = __req("./settings-card.js");
const NS = 'dsh-project-memory';
const name = NS;
/**
 * 顶层 `inject` **留空**（必需服务的软依赖清单在 services.ts 的 `REQUIRED_SERVICES`）。
 *
 * 这不是省略，而是契约选择：cordis 的顶层 inject 是装配期门控，缺一项就根本不调用
 * `apply()` —— 整个 client 半边静默消失。留空后 apply() 一定会被调用，服务缺失由
 * `missingServices()` 在运行时说清楚（面板上显示 + 日志告警）。
 */
const inject = [];
/**
 * 注册自建的 `/` 菜单源（见 slash.ts）。
 *
 * 整段都是**可选增强**：宿主没有 `inputTriggers` 服务、或该服务换了契约时，绝不能因此
 * 让整个 client 插件挂掉——那会连任务面板一起消失。`inputTriggers` 因此不进任何 `inject`
 * 声明，而是走嵌套 `ctx.inject` + 两层 try/catch（顶层 inject 未满足时 cordis 根本不会
 * 调用 apply，见 services.ts）。
 * @param ctx - client 根上下文
 */
function registerSlashSource(ctx) {
    if (typeof ctx?.inject !== 'function') {
        console.warn(`[${NS}] host has no ctx.inject — slash menu group disabled`);
        return;
    }
    try {
        // 只等真正用到的两项：`inputTriggers` 是注册入口，`sessions` 用来消费触发 token。
        // 那三行**不发宿主命令**（纯客户端开面板页），所以不把 `remote.commands` 写进这里 ——
        // 少一个装配期门控，就少一种"菜单组永远不出现"的静默形态。
        ctx.inject(['inputTriggers', 'sessions'], (scope) => {
            try {
                const inputTriggers = scope?.inputTriggers;
                if (!inputTriggers || typeof inputTriggers.registerSource !== 'function') {
                    console.warn(`[${NS}] host has no inputTriggers.registerSource — slash menu group disabled`);
                    return;
                }
                const source = createSlashSource(scope, {
                    sessions: scope.sessions,
                    // 菜单行是「打开面板的某一页」：直接落到 UI store，不绕宿主命令
                    // （面板的 closed/view 是浏览器侧状态，宿主命令碰不到）。
                    openView: (view) => taskUIStore.actions.openView(view),
                });
                scope.effect(() => inputTriggers.registerSource(source), 'dsh-project-memory: slash source');
            }
            catch (err) {
                console.warn(`[${NS}] slash source registration failed:`, err);
            }
        });
    }
    catch (err) {
        console.warn(`[${NS}] slash source injection failed:`, err);
    }
}
/**
 * 挂载任务面板（`shell.overlay` 浮层 + 会话内命令节点 + `show_task_panel` 工具视图）。
 *
 * `slots` 同样是软依赖：现成的就用；没有就**等它**（cordis 的 `ctx.inject` 是嵌套注入，
 * 只门控这一段回调，插件本身照样挂载）。等不到时由 {@link reportDegradedLater} 说明原因。
 * @param ctx - client 根上下文
 */
function registerTaskPanel(ctx) {
    const mount = (slots, effect) => {
        if (!slots || typeof slots.inject !== 'function') {
            console.warn(`[${NS}] host has no slots service — task panel disabled`);
            return;
        }
        // 每个 register 都挂到 effect 上：HMR/禁用再启用时先释放旧注册，否则同 id 重复注册会抛。
        const keep = (off) => {
            if (typeof off !== 'function')
                return;
            const dispose = () => {
                try {
                    off();
                }
                catch {
                    // 宿主已经拆掉这个槽：忽略
                }
            };
            if (typeof effect === 'function')
                effect(() => dispose);
        };
        const register = (spec, component) => {
            try {
                keep(slots.register(spec, component));
            }
            catch (err) {
                console.warn(`[${NS}] slot registration failed:`, err);
            }
        };
        try {
            slots.inject('shell.overlay', () => register({
                name: 'shell.overlay',
                id: 'dsh-project-memory-task-panel',
                order: 100, // 浮层顺序：低于 toast/弹窗即可，越高越靠后渲染
            }, () => createElement(TaskPanelEntry, { ctx })));
            // 会话内命令节点：按命令名 key 接管渲染，替换内置大段文本卡片
            // （文本含 JSON 载荷，只有面板需要它），避免载荷刷屏对话。
            // 合并后只剩一条用户命令 /tasks（子动词都记在同一个命令名下）。
            slots.inject('conversation.chat.commandview', () => register({ name: 'conversation.chat.commandview', key: 'tasks' }, TaskCommandNode));
            // 工具调用视图：`show_task_panel` 的唯一实际效果就是开面板，而面板状态在浏览器侧；
            // 宿主进程碰不到它（宿主契约里 `ToolRunContext` 没有 `ctx`）。认领这个**工具名**后，
            // 工具结果一渲染就把面板打开 —— 见 ShowTaskPanelNode.tsx。
            registerShowTaskPanelView(slots, keep);
        }
        catch (err) {
            console.warn(`[${NS}] task panel registration failed:`, err);
        }
    };
    if (typeof ctx?.inject === 'function') {
        try {
            ctx.inject(['slots'], (scope) => mount(scope?.slots ?? service(ctx, 'slots'), scope?.effect));
            return;
        }
        catch (err) {
            console.warn(`[${NS}] slots injection failed:`, err);
        }
    }
    mount(service(ctx, 'slots'), typeof ctx?.effect === 'function' ? ctx.effect.bind(ctx) : undefined);
}
/**
 * 过了宽限期仍然读不到必需服务时，打**一条**点名缺失项的告警。
 *
 * 为什么不在 `apply()` 里立刻报：装配是异步的，apply 时某个服务还没 provide 是正常的
 * （那样每次启动都会误报）。宽限期后还缺，就是真的缺 —— 这条日志是"静默消失"的反面。
 * @param ctx - client 根上下文
 */
function reportDegradedLater(ctx) {
    later(ctx, DEGRADED_GRACE_MS, () => {
        const missing = missingServices(ctx);
        if (missing.length === 0)
            return;
        console.warn(`[${NS}] degraded: client service(s) unavailable in this assembly: ${missing.join(', ')}`
            + ' — the client half is mounted anyway; the task panel shows the same reason.');
    });
}
function apply(ctx) {
    // 顶层不再有任何硬依赖：这里的几步都在缺服务时降级，绝不早退（早退就是静默消失）。
    registerTaskPanel(ctx);
    registerSlashSource(ctx);
    // 插件详情页上的可视化设置：宿主没有 settings / configForms 时整段不跑（见 settings-card.tsx）。
    registerSettingsCard(ctx);
    reportDegradedLater(ctx);
}
    __exports.apply = apply;
    __exports.name = name;
    __exports.inject = inject;
    };

    __modules["client-memory-src/commands.js"] = function (__exports, __req) {
/**
 * 客户端命令调用层：所有 `remote.commands.execute` 只走这里。
 *
 * 三件事必须集中在一处，否则每个调用点都会各漏一项：
 *  - 超时/取消（宿主 RPC 不返回时不能把面板永久锁死）；
 *  - 信封解析（宿主 `{ok:false,error}` 与 `{ok:true,value}` 是两种形状）；
 *  - 错误归一（调用点只关心 ok/text/error，不重复猜）。
 */
const { service } = __req("./services.js");
function errorText(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object') {
        const record = value;
        if (typeof record.message === 'string' && record.message)
            return record.message;
        if (typeof record.code === 'string' && record.code)
            return record.code;
    }
    return '';
}
/**
 * 执行一条 `/tasks` 命令。
 * @param ctx client 上下文（服务一律软探测）
 * @param sessionId 当前会话；为空表示没有可用数据通道
 * @param line 完整命令行（以 `/tasks` 开头）
 * @param timeoutMs 超时；到点 abort，调用方拿到可重试的错误态
 */
async function invokeCommand(ctx, sessionId, line, timeoutMs = 15_000) {
    const commands = service(ctx, 'remote.commands');
    if (!sessionId || !commands || typeof commands.execute !== 'function') {
        return { ok: false, text: '', error: 'no-channel' };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await commands.execute(sessionId, line, [], controller?.signal);
        const envelope = response && typeof response === 'object' ? response : null;
        if (envelope && envelope.ok === false) {
            return { ok: false, text: '', error: errorText(envelope.error) || 'command rejected' };
        }
        const execution = envelope && 'value' in envelope ? envelope.value : envelope;
        if (execution === undefined || execution === null) {
            return { ok: false, text: '', error: 'unknown or malformed command' };
        }
        const result = execution.result ?? execution;
        if (result?.kind === 'error') {
            return { ok: false, text: '', error: String(result.text ?? 'command error') };
        }
        return { ok: true, text: typeof result?.text === 'string' ? result.text : '' };
    }
    catch (err) {
        const aborted = controller?.signal.aborted === true;
        return { ok: false, text: '', error: aborted ? 'command timed out' : String(err?.message ?? err) };
    }
    finally {
        if (timer !== null)
            clearTimeout(timer);
    }
}
    __exports.invokeCommand = invokeCommand;
    };

    __modules["client-memory-src/i18n.js"] = function (__exports, __req) {
/**
 * client 半边唯一的「按宿主语言取翻译函数」入口。
 *
 * 为什么单独一个模块：同一段「软读 locale 服务 → 中文用 zh、其余（含服务缺失）用 en →
 * createTranslate」原先在 TaskPanel.tsx（getT）与 slash.ts（translator）各写一份。
 * 语言判据是产品语义而不是某次渲染的局部细节：两份副本各自演化时，面板会中文、
 * `/` 菜单却英文，而且看起来都"正常"。收敛到这里，只保留一个事实。
 *
 * 语义（刻意定死）：
 *  - 只认 `active === 'zh'`；其它值（en / 未知 / 缺失 locale 服务）一律英文——
 *    与旧实现一致，也不把"未知语言"猜成中文；
 *  - `service()` 是软探测，宿主没有 locale 服务时这里不抛错，面板照常渲染英文。
 * @module dsh-project-memory/client/i18n
 */
const { createTranslate, en, zh } = __req("./locales.js");
const { service } = __req("./services.js");
/**
 * 当前宿主语言对应的翻译函数。
 * @param ctx - client 上下文（缺失/贫服务宿主也能调用）。
 * @returns 翻译函数；语言服务不可读时退回英文。
 */
function translatorFor(ctx) {
    const active = service(ctx, 'locale')?.getSnapshot?.()?.active;
    return createTranslate(active === 'zh' ? zh : en);
}
    __exports.translatorFor = translatorFor;
    };

    __modules["client-memory-src/icons.js"] = function (__exports, __req) {
/**
 * 宿主图标兼容层（dsh 0.1.5 ↔ 0.1.7+）。
 *
 * 命名契约变过一次：
 *   - dsh 0.1.5（含 0.1.5-rc.x）：尺寸写进名字，如 `IconFolderOpenOutline16`；
 *   - dsh 0.1.7+：去掉尺寸后缀、改为字重后缀，如 `IconFolderOpenOutlineRegular` /
 *     `IconFolderOpenOutlineMedium`，尺寸改由 `size` prop 传入。
 * ui-primitives 是 web shell 的冻结 seed 模块（不是插件行），插件无法固定它，
 * 同一份产物会拿到宿主那一版的导出；直接按某一版的名字解构会在另一版上得到
 * `undefined`，React 渲染时抛 "Element type is invalid" 把面板整个打崩。
 *
 * 因此这里按旧名导出同名组件，运行时在两个名字里取存在的那个，并把旧名里的
 * 尺寸作为默认 `size`（两版的图标都接受 `size` prop，0.1.5 的默认值正是旧名后缀）。
 * 两版都没有该名字时降级为空组件并告警，而不是让面板崩溃。
 */
const { createElement } = __req("react");
const primitives = __req("@deepseek-ai/dsh-client-ui-primitives");
const table = primitives;
function resolveIcon(names) {
    for (const name of names) {
        const candidate = table[name];
        if (typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)) {
            return candidate;
        }
    }
    return null;
}
function icon(legacyName, currentName, defaultSize) {
    const impl = resolveIcon([legacyName, currentName]);
    if (impl === null) {
        console.warn(`[dsh-project-memory] host ui-primitives exports neither ${legacyName} nor ${currentName}; that icon renders nothing`);
        return function MissingIcon() {
            return null;
        };
    }
    function CompatIcon({ size = defaultSize, ...rest }) {
        return createElement(impl, { size, ...rest });
    }
    CompatIcon.displayName = legacyName;
    return CompatIcon;
}
const IconChevronDownOutline14 = icon('IconChevronDownOutline14', 'IconChevronDownOutlineRegular', 14);
const IconChevronUpOutline14 = icon('IconChevronUpOutline14', 'IconChevronUpOutlineRegular', 14);
const IconQuestionOutline14 = icon('IconQuestionOutline14', 'IconQuestionOutlineRegular', 14);
const IconCloseOutline16 = icon('IconCloseOutline16', 'IconCloseOutlineRegular', 16);
const IconFolderOpenOutline16 = icon('IconFolderOpenOutline16', 'IconFolderOpenOutlineRegular', 16);
const IconCheckOutline16 = icon('IconCheckOutline16', 'IconCheckOutlineRegular', 16);
const IconPlayOutline16 = icon('IconPlayOutline16', 'IconPlayOutlineRegular', 16);
// `/` 菜单行图标。旧名的尺寸后缀两版并不一致（有的是 14 有的是 16），
// 所以这里的默认 size 只影响"宿主两版都没有该名字"的降级路径——正常路径由宿主自己决定。
const IconChecklistOutline16 = icon('IconChecklistOutline14', 'IconChecklistOutlineRegular', 14);
const IconLightOutline16 = icon('IconLightOutline16', 'IconLightOutlineRegular', 16);
const IconGlobeOutline16 = icon('IconGlobeOutline14', 'IconGlobeOutlineRegular', 14);
    __exports.IconChevronDownOutline14 = IconChevronDownOutline14;
    __exports.IconChevronUpOutline14 = IconChevronUpOutline14;
    __exports.IconQuestionOutline14 = IconQuestionOutline14;
    __exports.IconCloseOutline16 = IconCloseOutline16;
    __exports.IconFolderOpenOutline16 = IconFolderOpenOutline16;
    __exports.IconCheckOutline16 = IconCheckOutline16;
    __exports.IconPlayOutline16 = IconPlayOutline16;
    __exports.IconChecklistOutline16 = IconChecklistOutline16;
    __exports.IconLightOutline16 = IconLightOutline16;
    __exports.IconGlobeOutline16 = IconGlobeOutline16;
    };

    __modules["client-memory-src/kind-label.js"] = function (__exports, __req) {
/**
 * 记忆 kind 的展示名（纯函数、零依赖，面板卡片与记忆视图共用）。
 *
 * 为什么单独一个模块：同一份「kind → 词典 key」映射原先在两处各抄一份
 * （TaskComponents.tsx 的 insightKindLabel、MemoryView.tsx 的 kindText，逐字相同）。
 * 新增 kind 时漏改一处，两个界面就会对同一条记忆显示不同的标签；而词典 key 本身
 * 是 locales.ts 的一等公民（`mem.kind.*` 中英两份），映射不该散落在组件里。
 *
 * 语义（刻意定死，边缘输入也用测试钉住）：
 *  - 四个合法 kind 一律走 `t(key)`，语言切换由词典自己负责；
 *  - 其余值**原样返回**（字符串化），绝不回退到某个默认 kind —— 脏数据要让调用方看见；
 *  - 用 `hasOwn` 而不是 `map[kind] ?? kind` 查表：`kind: '__proto__'` / `'constructor'`
 *    在对象字面量上会命中原型成员（返回函数/对象），React 渲染对象会直接抛
 *    "Objects are not valid as a React child"。非 kind 的键必须当成非法值处理。
 * @module dsh-project-memory/client/kind-label
 */

/** kind → 词典 key（唯一一份；与 locales.ts 的 `mem.kind.*` 一一对应）。 */
const KIND_LABEL_KEYS = Object.freeze({
  lesson: 'mem.kind.lesson',
  decision: 'mem.kind.decision',
  procedure: 'mem.kind.procedure',
  experience: 'mem.kind.experience',
})

/**
 * 一条记忆的 kind 展示名。
 * @param {unknown} kind - 记忆条目的 kind（可能是缺失/脏值）。
 * @param {any} t - 翻译函数。这里刻意不收窄成 `(key: string) => string`：组件的 t 是
 *   `ReturnType<typeof createTranslate>`（key 为词典字面量并集），收窄会让严格模式下的
 *   函数参数逆变检查拒绝调用；key 本身由本模块掌管，调用方只需要"能翻译一个字符串 key"。
 * @returns {string} 本地化后的标签；非法 kind 原样字符串化。
 */
function insightKindLabel(kind, t) {
  const key = typeof kind === 'string' && Object.hasOwn(KIND_LABEL_KEYS, kind) ? KIND_LABEL_KEYS[kind] : null
  if (key === null) return String(kind ?? '')
  return t(key)
}
    __exports.insightKindLabel = insightKindLabel;
    __exports.KIND_LABEL_KEYS = KIND_LABEL_KEYS;
    };

    __modules["client-memory-src/locales.js"] = function (__exports, __req) {
/**
 * Locale dictionaries for Task Panel
 */
const zh = {
    'panel.title': '工作流任务',
    'panel.active': '进行中',
    'panel.total': '总计',
    'panel.minimize': '收起为顶部迷你条',
    'panel.close': '关闭面板（隐藏，/task 可唤起）',
    'panel.refresh': '同步最新任务',
    'panel.style': '切换面板风格',
    'style.native': '原生',
    'style.glass': '玻璃',
    'style.brutal': '粗野',
    'style.mono': '终端',
    'panel.syncing': '同步中…',
    'panel.sync-failed': '同步失败',
    'panel.hints-on': '显示提示信息',
    'panel.hints-off': '隐藏提示信息',
    'drag.cancel': '取消拖拽',
    'panel.empty': '暂无任务',
    'panel.empty-desc': '让模型开始工作并维护 todo 清单后会自动建档',
    'panel.no-session': '还没有会话',
    'panel.no-channel': '数据通道不可用（客户端服务缺失）',
    'panel.degraded': '插件降级：缺少客户端服务 {names}',
    'task.progress': '进度',
    'task.steps': '步骤',
    'task.files': '文件',
    'task.current': '当前',
    'task.title-edit': '双击修改标题',
    'task.switch': '切换到此任务',
    'task.unbind': '取消当前任务',
    'task.archive': '归档',
    'task.drag': '拖拽移动',
    'step.completed': '已完成',
    'step.in-progress': '进行中',
    'step.pending': '待办',
    'step.edit-hint': '双击编辑步骤文案；点击图标循环 待办/进行中/已完成',
    'file.copy': '复制路径',
    'file.copied': '已复制路径',
    'minibar.current': '当前任务',
    'minibar.click-expand': '点击展开并同步',
    'minibar.tasks': '个任务',
    'minibar.no-task': '暂无任务 · 点击查看',
    'view.cycle': '切换视图：任务 / 项目记忆 / 全局记忆',
    'view.task': '任务',
    'view.project': '项目记忆',
    'view.global': '全局记忆',
    'mem.scope.task': '本任务草稿',
    'mem.scope.project': '项目记忆',
    'mem.scope.global': '全局记忆',
    'mem.empty': '暂无记忆条目（反思或 save_lesson 后出现）',
    'mem.confirm': '审核',
    'mem.promote': '提升',
    'mem.demote': '降级',
    'mem.archive': '归档',
    'mem.restore': '恢复',
    'mem.delete': '删除',
    'mem.draft': '草稿',
    'mem.archived': '已归档',
    'mem.loading': '加载中…',
    'mem.loadingMore': '加载中…',
    'mem.loadMore': '加载更多',
    'mem.progress': '已显示 {loaded} / {total}',
    'mem.allLoaded': '已全部加载（{total} 条）',
    'mem.retry': '重试',
    'mem.error': '同步失败',
    'mem.kind.lesson': '坑',
    'mem.kind.decision': '权衡',
    'mem.kind.procedure': '指南',
    'mem.kind.experience': '经验',
    'mem.needs-bound': '需绑定任务后可降级',
    'mem.new': '新建',
    'mem.save': '保存',
    'mem.cancel': '取消',
    'mem.f.title': '标题（教训模式/主题/指南名）',
    'mem.f.kind': '类型',
    'mem.f.body': '做法 / 理由 / 解法',
    'mem.f.steps': '步骤（每行一步）',
    'mem.f.trigger': '作为 Skill：触发关键词（逗号分隔）',
    'mem.saved': '已保存',
    'mem.edit': '编辑',
    'mem.section-label': '任务记忆',
    // `/` 菜单：自建 slash 源的行文案。分组标题走候选的 section（见 slash.ts），
    // 不走 slash.menu 词典——那个 namespace 由宿主的 ui-input-trigger 独占，重复注册会抛错。
    // 三个行标题直接复用上面面板的 view.* 文案，保证菜单与面板叫同一个名字。
    'slash.group': '工作流',
    'slash.tasks-desc': '任务清单：步骤进度、涉及文件、当前会话绑定',
    'slash.project-desc': '项目记忆：本项目的教训 / 决策 / 流程',
    'slash.global-desc': '全局记忆：跨项目的经验条目',
    // 插件页上的可视化设置卡片（src/client/settings-card.tsx）。
    'settings.title': '常用设置',
    'settings.subtitle': '保存后立即生效（启动时全量索引除外）；其余配置在 profile 的 cordis.patch.yml 里。',
    'settings.unsaved': '未保存',
    'settings.autoIndexOnFirstUse.title': '启动时全量索引',
    'settings.autoIndexOnFirstUse.hint': '插件加载后扫描当前工作目录；打开后从下次启动开始生效。',
    'settings.watchInterval.title': '刷新间隔',
    'settings.watchInterval.hint': '后台自动刷新索引的频率（秒）。回合进行中降频，空闲时最多退避到 2 分钟。',
    'settings.llmQueryExpansion.title': '检索时扩展查询',
    'settings.llmQueryExpansion.hint': '让模型先改写几条变体查询再检索，命中更准，但会消耗 token。',
    'settings.unit.seconds': '秒',
    'settings.form.unavailable': '设置不可用：宿主没有提供本插件的配置命名空间。',
    'settings.form.readOnly': '当前部署只读，改动无法保存。',
    'settings.form.saveFailed': '宿主没有接受这次保存，请检查取值。',
    'settings.form.save': '保存',
    'settings.form.saving': '保存中…',
};
const en = {
    'panel.title': 'Task Flow',
    'panel.active': 'Active',
    'panel.total': 'Total',
    'panel.minimize': 'Collapse to mini bar',
    'panel.close': 'Close panel (hidden; /task reopens)',
    'panel.refresh': 'Sync latest tasks',
    'panel.style': 'Panel style',
    'style.native': 'Native',
    'style.glass': 'Glass',
    'style.brutal': 'Brutal',
    'style.mono': 'Mono',
    'panel.syncing': 'Syncing…',
    'panel.sync-failed': 'Sync failed',
    'panel.hints-on': 'Show hints',
    'panel.hints-off': 'Hide hints',
    'drag.cancel': 'Cancel drag',
    'panel.empty': 'No Tasks',
    'panel.empty-desc': 'Tasks are created automatically when the model maintains a todo list',
    'panel.no-session': 'No session yet',
    'panel.no-channel': 'data channel unavailable (missing client service)',
    'panel.degraded': 'Plugin degraded — missing client service(s): {names}',
    'task.progress': 'Progress',
    'task.steps': 'Steps',
    'task.files': 'Files',
    'task.current': 'Current',
    'task.title-edit': 'Double-click to rename',
    'task.switch': 'Switch to this task',
    'task.unbind': 'Unbind current task',
    'task.archive': 'Archive',
    'task.drag': 'Drag to move',
    'step.completed': 'Completed',
    'step.in-progress': 'In Progress',
    'step.pending': 'Pending',
    'step.edit-hint': 'Double-click to edit; click the icon to cycle status',
    'file.copy': 'Copy path',
    'file.copied': 'Path copied',
    'minibar.current': 'Current task',
    'minibar.click-expand': 'Click to expand & sync',
    'minibar.tasks': 'tasks',
    'minibar.no-task': 'No tasks · click to view',
    'view.cycle': 'Switch view: tasks / project memory / global memory',
    'view.task': 'Tasks',
    'view.project': 'Project Memory',
    'view.global': 'Global Memory',
    'mem.scope.task': 'Task drafts',
    'mem.scope.project': 'Project memory',
    'mem.scope.global': 'Global memory',
    'mem.empty': 'No memory entries yet (created by reflection or save_lesson)',
    'mem.confirm': 'Approve',
    'mem.promote': 'Promote',
    'mem.demote': 'Demote',
    'mem.archive': 'Archive',
    'mem.restore': 'Restore',
    'mem.delete': 'Delete',
    'mem.draft': 'draft',
    'mem.archived': 'archived',
    'mem.loading': 'Loading…',
    'mem.loadingMore': 'Loading…',
    'mem.loadMore': 'Load more',
    'mem.progress': 'Showing {loaded} of {total}',
    'mem.allLoaded': 'All {total} loaded',
    'mem.retry': 'Retry',
    'mem.error': 'Sync failed',
    'mem.kind.lesson': 'lesson',
    'mem.kind.decision': 'decision',
    'mem.kind.procedure': 'procedure',
    'mem.kind.experience': 'experience',
    'mem.needs-bound': 'Bind a task to demote',
    'mem.new': 'New',
    'mem.save': 'Save',
    'mem.cancel': 'Cancel',
    'mem.f.title': 'Title (pattern / topic / procedure name)',
    'mem.f.kind': 'Kind',
    'mem.f.body': 'Fix / reason / solution',
    'mem.f.steps': 'Steps (one per line)',
    'mem.f.trigger': 'As Skill: trigger keywords (comma separated)',
    'mem.saved': 'Saved',
    'mem.edit': 'Edit',
    'mem.section-label': 'Task memory',
    'slash.group': 'Workflow',
    'slash.tasks-desc': 'Task list: progress, involved files, current session binding',
    'slash.project-desc': 'Project memory: this project’s lessons / decisions / procedures',
    'slash.global-desc': 'Global memory: experience entries shared across projects',
    'settings.title': 'Common settings',
    'settings.subtitle': 'Saved changes apply immediately, except the startup full index; the rest stays in the profile’s cordis.patch.yml.',
    'settings.unsaved': 'Unsaved',
    'settings.autoIndexOnFirstUse.title': 'Full index on startup',
    'settings.autoIndexOnFirstUse.hint': 'Scan the current working directory after the plugin loads; takes effect from the next start.',
    'settings.watchInterval.title': 'Refresh interval',
    'settings.watchInterval.hint': 'How often the index refreshes in the background, in seconds. Slower during a turn, up to two minutes when idle.',
    'settings.llmQueryExpansion.title': 'Expand queries',
    'settings.llmQueryExpansion.hint': 'Ask the model for a few query variants before search: better recall, spends tokens.',
    'settings.unit.seconds': 's',
    'settings.form.unavailable': 'Settings unavailable: the host serves no configuration namespace for this plugin.',
    'settings.form.readOnly': 'This deployment is read-only; changes cannot be saved.',
    'settings.form.saveFailed': 'The host rejected this save; check the values.',
    'settings.form.save': 'Save',
    'settings.form.saving': 'Saving…',
};
function createTranslate(dict) {
    return (key, params) => {
        let text = dict[key] ?? key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
            }
        }
        return text;
    };
}
    __exports.createTranslate = createTranslate;
    __exports.zh = zh;
    __exports.en = en;
    };

    __modules["client-memory-src/memory-load.js"] = function (__exports, __req) {
/**
 * MemoryView 的纯逻辑层：列表载荷解析与切页缓存。
 *
 * 从 MemoryView.tsx 中拆出（该文件 616 行，绝大部分是渲染）。这里零 React 依赖，
 * 可单独测试，也是 TaskCommandNode 解析 insight 载荷时的唯一入口。
 */
const { normalizeWindow } = __req("./paging.js");
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

function readInsightCache(sessionId, scope, root, boundTaskId) {
  const key = insightCacheKey(sessionId, scope, root, boundTaskId)
  const hit = insightCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > INSIGHT_CACHE_TTL_MS) {
    insightCache.delete(key)
    return null
  }
  return hit
}

function invalidateInsightCache(sessionId, root) {
  const prefix = `${sessionId || ''}|${root || ''}|`
  for (const key of [...insightCache.keys()]) {
    if (key.startsWith(prefix)) insightCache.delete(key)
  }
}

function writeInsightCache(sessionId, scope, root, boundTaskId, rows, total, nextOffset) {
  const key = insightCacheKey(sessionId, scope, root, boundTaskId)
  insightCache.delete(key)
  insightCache.set(key, { rows, total, nextOffset, at: Date.now() })
  while (insightCache.size > INSIGHT_CACHE_MAX) {
    const oldest = insightCache.keys().next().value
    if (oldest === undefined) break
    insightCache.delete(oldest)
  }
}

function parseInsightPayloadText(text) {
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
    if (!Array.isArray(data.items)) return null
    // 分页字段走 paging.js 归一：老宿主没有 total/nextOffset 时按"一次给全"降级，
    // 新宿主则给出真实的下一页游标。
    const w = normalizeWindow(data, 0)
    return { scope: data.scope ?? 'project', count: w.total, total: w.total, offset: w.offset, nextOffset: w.nextOffset, items: w.items }
  } catch {
    return null
  }
}
    __exports.readInsightCache = readInsightCache;
    __exports.invalidateInsightCache = invalidateInsightCache;
    __exports.writeInsightCache = writeInsightCache;
    __exports.parseInsightPayloadText = parseInsightPayloadText;
    };

    __modules["client-memory-src/paging.js"] = function (__exports, __req) {
/**
 * 记忆列表的分页窗口工具（纯函数，无 React 依赖），决策边界由 test/client-paging.test.mjs 钉住。
 * 协议：`/tasks insight list <scope> <offset> <limit>` → `{ scope, count, total, offset, items, nextOffset }`，
 * 对应宿主 src/commands/insight-actions.js 的 `list` 分支；`nextOffset === null` 到底，缺字段按全量降级。
 */

/** 每页条数。宿主侧 INSIGHT_PAGE_MAX=200 是防滥用封顶，正常永远走这个值。 */
const PAGE_SIZE = 30

/**
 * 单次请求的条数上限，必须与宿主 `INSIGHT_PAGE_MAX`（src/commands/insight-actions.js）一致；
 * 客户端 bundle 不能 import 服务端模块，所以这里是第二份常量，test/insight-paging.test.mjs
 * 有交叉断言把两边钉在一起。
 * 宿主对超限的 `limit` 是**静默**夹到 200：动作后的重放整份替换，加载了 500 条的用户点一次
 * 动作就会被打回 200 条，所以必须先在客户端夹住。
 */
const HOST_PAGE_MAX = 200

/** 预取提前量：哨兵进入视口**下方 600px** 就开始取下一页，数据在滚到底之前到位。 */
const PREFETCH_MARGIN = '600px 0px'

/** 加载指示的延迟显示阈值（毫秒）：本地数据通常几十毫秒就回来，立即显示只会"闪一下"。 */
const SPINNER_DELAY_MS = 150

/**
 * 拼一页的请求命令行：数据通道是命令文本，协议只在这里拼一次。
 * @param {string} scope - `task` | `project` | `global`。
 * @param {number} offset - 起始下标。
 * @param {number} limit - 本页条数。
 * @returns {string} 可直接交给 remote.commands.execute 的命令行。
 */
function insightListLine(scope, offset, limit) {
  return `/tasks insight list ${scope} ${offset} ${limit}`
}

/**
 * 追加一页并**按 id 去重**。去重是必需的：前缀重放（见 MemoryView.loadPrefix）与并发
 * 刷新都可能让同一 id 出现两次，重复行带重复按钮，点错一个就是误删。
 * @param {ReadonlyArray<{id?: string}>} prev - 已渲染条目。
 * @param {ReadonlyArray<{id?: string}>} page - 新到的一页。
 * @returns {Array} 追加后的数组；无新增时**原样返回** prev（避免无意义的重渲染）。
 */
function appendUnique(prev, page) {
  if (!Array.isArray(page) || page.length === 0) return prev
  const seen = new Set(prev.map((row) => row && row.id))
  const fresh = page.filter((row) => row && !seen.has(row.id))
  if (fresh.length === 0) return prev
  return [...prev, ...fresh]
}

/**
 * 把宿主载荷归一成窗口状态，兼容三种形态：新宿主分页（有 `total` + `nextOffset`）、新宿主不
 * 分页（省略 limit，`nextOffset === null`）、老宿主/老 bundle（两个字段都没有 → 视为一次给全）。
 * @param {any} data - 已解析的 JSON 载荷。
 * @param {number} fallbackOffset - 请求时的 offset（载荷没给 offset 时用它）。
 * @returns {{items: any[], total: number, offset: number, nextOffset: number|null}} 归一化窗口。
 */
function normalizeWindow(data, fallbackOffset = 0) {
  const items = Array.isArray(data && data.items) ? data.items : []
  const rawTotal = data && typeof data.total === 'number' ? data.total : data && typeof data.count === 'number' ? data.count : items.length
  const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : items.length
  const offset = data && Number.isFinite(data.offset) ? data.offset : fallbackOffset
  const next = data && data.nextOffset
  const nextOffset = typeof next === 'number' && Number.isFinite(next) && next >= 0 ? next : null
  return { items, total, offset, nextOffset }
}

/**
 * 页脚文案用的"已显示 N / 总数"。
 * @param {number} loaded - 已渲染条数。
 * @param {number} total - 服务端总数。
 * @returns {{loaded: number, total: number}} 归一化后的计数（total 不会小于 loaded）。
 */
function progressCounts(loaded, total) {
  const l = Number.isFinite(loaded) && loaded > 0 ? Math.floor(loaded) : 0
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  return { loaded: l, total: Math.max(l, t) }
}

/**
 * 请求闸门：协调首屏 / 追加 / 动作后重放这几类**会重叠**的请求。两件事必须分开：
 *   - **过期响应丢弃**（靠序号 + 作用域判定）；
 *   - **新请求照发**（只有同一个 key 正在飞时才去重，避免哨兵连续触发重复取同一页）。
 * 用"有在途请求就直接 return"的布尔守卫会让切 scope 时新请求被丢掉、过期响应又被作用域检查
 * 丢掉 → 新列表永远空白。
 * @returns {{begin: Function, end: Function, isStale: Function}} 闸门。
 */
function createRequestGate() {
  let seq = 0
  let inflightKey = null
  return {
    /**
     * 申请发起一次请求。
     * @param {string} key - 请求身份（scope|offset|limit|append）。
     * @returns {number|false} 该请求的序号；同一 key 已在飞时返回 false（去重）。
     */
    begin(key) {
      if (inflightKey === key) return false
      inflightKey = key
      seq += 1
      return seq
    },
    /**
     * 请求结束。
     * @param {string} key - 请求身份。
     * @param {number} ticket - begin 返回的序号。
     * @returns {boolean} 它是否仍是最后一次请求（决定加载标志该不该回落）。
     */
    end(key, ticket) {
      if (inflightKey === key) inflightKey = null
      return ticket === seq
    },
    /**
     * 该响应是否已过期。
     * @param {number} ticket - 发出时的序号。
     * @param {string} requestedScope - 发出时的作用域。
     * @param {string} currentScope - 当前作用域。
     * @returns {boolean} true=必须整份丢弃。
     */
    isStale(ticket, requestedScope, currentScope) {
      return ticket !== seq || requestedScope !== currentScope
    },
  }
}
    __exports.insightListLine = insightListLine;
    __exports.appendUnique = appendUnique;
    __exports.normalizeWindow = normalizeWindow;
    __exports.progressCounts = progressCounts;
    __exports.createRequestGate = createRequestGate;
    __exports.PAGE_SIZE = PAGE_SIZE;
    __exports.HOST_PAGE_MAX = HOST_PAGE_MAX;
    __exports.PREFETCH_MARGIN = PREFETCH_MARGIN;
    __exports.SPINNER_DELAY_MS = SPINNER_DELAY_MS;
    };

    __modules["client-memory-src/relative-time.js"] = function (__exports, __req) {
/**
 * 相对时间（中文）的唯一实现：面板、`list_tasks`、`/tasks` 共用。
 *
 * 两处调用方对"时间坏掉"的期待不同，所以 fallback 是参数而不是第二份实现：
 *   - 服务端把条目交给模型，省略时间会像"没有时间信息"，默认 `'未知'`；
 *   - 面板是给人看的，时间坏了就留空，不显示脏字。
 *
 * 客户端旧副本用 `new Date(iso).getTime()` 直接算 diff：非法 ISO 得到 NaN，一路比较都不成立，
 * 最后渲染成 "NaN天前"。收敛到这一份后，非法/缺失时间一律走 fallback（而不是各写一套判据）。
 * @param {string} [iso] ISO 时间戳
 * @param {string} [fallback] 解析失败时的文案
 * @returns {string}
 */
function timeAgo(iso, fallback = '未知') {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return fallback
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}
    __exports.timeAgo = timeAgo;
    };

    __modules["client-memory-src/services.js"] = function (__exports, __req) {
/**
 * Client 服务软探测 —— 顶层 `inject` 是「整半边静默消失」的开关，这里把它降级成运行时探测。
 *
 * cordis 的顶层 `inject` 是**装配期门控**：只要声明的一项在当前客户端装配里不可用，
 * 它根本不会调用 `apply()`。这是插件能遇到的最坏失败形态 —— 没有面板、没有 `/` 组、
 * 也没有任何报错（0.1.7 会话格式变更、0.2.0 装配差异都踩过这一条）。
 *
 * 所以本插件的 client 半边把必需服务全部当**软依赖**：
 *   - 顶层 `inject` 留空 → `apply()` 一定被调用，插件一定挂载；
 *   - 每个服务用 `ctx.get(name)` 现场读（cordis 里它**不需要 inject**），读不到就降级；
 *   - 缺什么由 {@link missingServices} 说清楚：面板上显示、日志里告警，而不是静默消失。
 *
 * 另一条与 `inject` 同源的坑：**属性路径（`ctx.remote.commands`）也是 inject 门控的**。
 * 子命名空间在 cordis 里是**独立注册的扁平服务**（名字就叫 `remote.commands`，由 gateway 的
 * `RemoteNamespaceService` 在嵌套 fiber 里 provide），读它只有 `ctx.get('remote.commands')`
 * 这一条路不需要 inject；`ctx.remote.commands` 会走 ctx 代理，报
 * `cannot get property "remote.commands" without inject` —— 于是"宿主明明有，插件却说缺"。
 * 见 {@link service}：整名优先，属性路径只作老宿主回退。
 */
/**
 * 必需服务。带 `.` 的名字（`remote.commands`）是 cordis 里**独立注册的扁平服务名**，
 * 不是"父服务上的属性"——只是老宿主可能把它挂在服务对象上，`service()` 才留了属性回退。
 * 顺序即告警文案里的顺序，从"没有它就没有界面"到"没有它只是少个数据通道"。
 */
const REQUIRED_SERVICES = ['slots', 'sessions', 'remote', 'remote.commands', 'locale'];
/**
 * 读一个服务（或它的属性路径），**永不抛出**。
 *
 * 读法有两条，顺序不能反：
 *  1. **整名优先**：`ctx.get('remote.commands')`。cordis 里子命名空间就是独立注册的扁平服务，
 *     这条路不经过 inject 门控 —— 它是"没有顶层 inject 的插件"读 `remote.commands` 的**唯一**可行路径。
 *  2. **属性路径回退**：`ctx.get('remote').commands`。老宿主 / 测试替身把子命名空间挂在父服务对象上时走这条。
 *
 * `ctx.get()` 是 cordis 官方的"无 inject 读取"入口；老宿主没有它时回退到 `ctx[name]` —— 但那条路
 * 既会因"没有 inject 又没有实现"**抛错**（而不是返回 undefined），也**读不到扁平子命名空间**，
 * 所以必须整段接住：软依赖的全部意义就是不能让它带崩调用方，读不到就交给调用方按 undefined 处理。
 * @param ctx - client 上下文（宿主没给上下文时返回 undefined）。
 * @param path - 服务名，或 `服务名.属性.属性`。
 * @returns 服务值；缺失/不可读时为 undefined。
 */
function service(ctx, path) {
    const whole = readService(ctx, path);
    if (whole !== undefined)
        return whole;
    const [head, ...rest] = path.split('.');
    if (rest.length === 0)
        return whole;
    let value = readService(ctx, head);
    for (const key of rest) {
        if (value === null || value === undefined)
            return undefined;
        try {
            value = value[key];
        }
        catch {
            return undefined;
        }
    }
    return value;
}
/**
 * 读一层服务实现：先 `ctx.get(name)`，再回退到属性访问。
 * @param ctx - client 上下文。
 * @param name - 服务名（不含路径）。
 * @returns 服务值，或 undefined。
 */
function readService(ctx, name) {
    if (ctx === null || ctx === undefined)
        return undefined;
    try {
        const get = ctx.get;
        if (typeof get === 'function') {
            const found = get.call(ctx, name);
            if (found !== undefined)
                return found;
        }
    }
    catch {
        // 服务未装配 / 读被拒：继续走属性回退，缺失由调用方按 undefined 处理。
    }
    try {
        return ctx[name];
    }
    catch {
        return undefined;
    }
}
/**
 * 当前装配里读不到的必需服务。
 * @param ctx - client 上下文。
 * @param names - 待检查的服务路径，默认 {@link REQUIRED_SERVICES}。
 * @returns 缺失的服务路径；全都在时为 `[]`。
 */
function missingServices(ctx, names = REQUIRED_SERVICES) {
    return names.filter((name) => service(ctx, name) === undefined);
}
/**
 * 降级检查的宽限期（毫秒）。装配是异步的：`apply()` 时某个服务还没到位**不算缺失**
 * （它可能几百毫秒后才 provide），所以只在过了宽限期仍然读不到时才告警。
 */
const DEGRADED_GRACE_MS = 3000;
/**
 * 延后执行一次（宿主 ctx 有 `setTimeout` 就用它的，能随 fiber 一起回收）。
 * @param ctx - client 上下文。
 * @param delay - 毫秒。
 * @param fn - 回调。
 */
function later(ctx, delay, fn) {
    try {
        if (typeof ctx?.setTimeout === 'function') {
            ctx.setTimeout(fn, delay);
            return;
        }
        const handle = globalThis.setTimeout(fn, delay);
        // Node（本仓测试就跑在 Node）里 pending 定时器会拖住进程退出；浏览器返回值是数字，这行是 no-op。
        if (handle !== null && typeof handle === 'object' && typeof handle.unref === 'function')
            handle.unref();
    }
    catch {
        // 没有可用计时器：插件照常挂载，降级原因仍由面板渲染时显示。
    }
}
    __exports.service = service;
    __exports.missingServices = missingServices;
    __exports.later = later;
    __exports.REQUIRED_SERVICES = REQUIRED_SERVICES;
    __exports.DEGRADED_GRACE_MS = DEGRADED_GRACE_MS;
    };

    __modules["client-memory-src/session-id.js"] = function (__exports, __req) {
/**
 * 会话列表快照 → 当前会话 id（宿主版本兼容层）。
 *
 * 快照结构被宿主改过一次，旧写法只认第一种：
 *   - dsh ≤0.1.6：`{ current?: id, items: [{ sessionId, blank }] }`
 *   - dsh 0.1.7+：`{ ids: id[], byId: Record<id, SessionSummary>, phase, projectionsBySession }`
 *     —— `current` 与 `items` **都不存在了**。
 *
 * 后果一（永远 null）：0.1.7 上 `snap.current` 和 `snap.items` 都是 undefined → 旧代码永远
 * 返回 null → 面板显示「还没有会话」、记忆视图报 `同步失败: no session / commands service`。
 * 而**任务视图渲染的是 task-data-store 里的缓存快照**，看起来还正常，所以这个故障很容易被
 * 误读成"数据格式/旧版本兼容"问题。
 *
 * 后果二（不跟随切换）：光"取一个非 null 的 id"不够 —— 兜底取的是宿主列表里第一个非 blank 的
 * 会话，它**不随用户切换对话而变化**，面板会一直停在同一个会话（从而显示错项目的任务）。
 * 0.1.7 判断"当前会话"的正式依据是 `SessionSummary.retainedBy.mainView > 0`：
 * 主视图正在 retain 的那个就是用户正在看的那个（第一方同款判据，见 ui-layout/DocumentTitle.tsx
 * 与 ui-session）。它就在**列表快照的 byId 行上**，而 retain 计数变化会 `list.set(...)` 重新发布
 * 快照（session-controller/.../sessions/service.ts 的 publishRetention），所以订阅
 * `ctx.sessions.list` 的组件会在切换会话时自动重渲染 —— 这条必须走快照内字段，不能另开
 * `retainInfo()` 订阅，否则切换不会触发重渲染。
 *
 * 实测形状见 `packages/api/session-controller/src/client/sessions/service.ts` 的
 * `SessionListState` / `SessionSummary`。
 */

/** 正数才算持有（retain 计数缺失/0/负数一律当没有）。 */
function heldCount(value) {
  return typeof value === 'number' && value > 0 ? value : 0
}

/** 从一行 summary 抽出本模块关心的三个事实。 */
function rowFacts(row) {
  return {
    blank: row?.blank === true,
    /** 主视图对这条会话的 retain 计数；> 0 即"用户正在看它"。 */
    mainView: heldCount(row?.retainedBy?.mainView),
  }
}

/**
 * 把两种快照形状统一成 `{ id, blank, mainView }` 列表，顺序保持宿主给的顺序。
 * @param {object|undefined|null} snap - `ctx.sessions.list.getSnapshot()`
 * @returns {Array<{id: string, blank: boolean, mainView: number}>} 认不出的形状返回空数组
 */
function sessionRows(snap) {
  if (!snap || typeof snap !== 'object') return []
  // 旧形状：items 里每行自带 sessionId / blank / retainedBy
  if (Array.isArray(snap.items)) {
    return snap.items
      .map((row) => ({ id: row?.sessionId, ...rowFacts(row) }))
      .filter((row) => typeof row.id === 'string' && row.id !== '')
  }
  const byId = snap.byId && typeof snap.byId === 'object' ? snap.byId : null
  // 0.1.7 形状：ids 表达宿主列表成员（顺序权威），行数据在 byId 里
  if (Array.isArray(snap.ids)) {
    return snap.ids
      .map((id) => ({ id, ...rowFacts(byId?.[id]) }))
      .filter((row) => typeof row.id === 'string' && row.id !== '')
  }
  // 只有 byId 的半成品形状：仍然可用，只是丢了宿主顺序
  if (byId) {
    return Object.keys(byId)
      .map((id) => ({ id, ...rowFacts(byId[id]) }))
      .filter((row) => typeof row.id === 'string' && row.id !== '')
  }
  return []
}

/**
 * 选出一个可用于执行命令的会话 id（即"用户正在看的那个"）。
 *
 * 优先级：
 *  1. 旧形状的显式 `current`（≤0.1.6 的权威字段，保持原语义）；
 *  2. `retainedBy.mainView > 0` 的会话（0.1.7 的权威判据，**跟随会话切换**）；
 *  3. 第一个非 blank → 第一个（对两种形状都适用的兜底）。
 * @param {object|undefined|null} snap - `ctx.sessions.list.getSnapshot()`
 * @returns {string|null} 会话 id；拿不到返回 null（调用方据此显示「还没有会话」）
 */
function pickSessionId(snap) {
  if (!snap || typeof snap !== 'object') return null
  if (typeof snap.current === 'string' && snap.current !== '') return snap.current
  const rows = sessionRows(snap)
  const live = rows.find((row) => row.mainView > 0)
  if (live) return live.id
  const chosen = rows.find((row) => !row.blank) ?? rows[0]
  return chosen ? chosen.id : null
}
    __exports.sessionRows = sessionRows;
    __exports.pickSessionId = pickSessionId;
    };

    __modules["client-memory-src/settings-card.js"] = function (__exports, __req) {
/**
 * 插件详情页上的「常用设置」卡片。
 *
 * 座位是 `plugins.bundle.config`（key = 包名），外形照宿主自己的插件卡片长：
 * 一行标题 + 说明 + 折叠箭头，**默认收起**；展开后是一列开关，底部右对齐一个保存。
 *
 * 数据面**完全走宿主设置**，不自建第二份配置：
 *   Config 里标了 `.volatile()` 的字段 → 宿主 settings 文档的一个命名空间（ns = 条目 id）
 *   → 客户端 `ctx.configForms.get(...)` 读写 → 宿主校验 + revision fence + volatile 原地更新。
 *   这里既不写 profile 的 yml，也不缓存值：卡片永远是宿主那份配置的投影。
 *
 * 由 .tsx 手写改写为 createElement（原 355 行 / 38 处 JSX）。
 */
const { Button, SettingsFormModel, Switch, settingsNumberField } = __req("@deepseek-ai/dsh-client-ui-primitives");
const { createElement: h, useEffect } = __req("react");
const { service } = __req("./services.js");
const { IconChevronDownOutline14 } = __req("./icons.js");
const { createTranslate, en, zh } = __req("./locales.js");
const { settingsCss: css } = __req("./styles.js");
/** 合并后的包名：`plugins.bundle.config` 的 key 必须与 profile 里安装的包名一致。 */
const SETTINGS_PACKAGE_NAME = '@local/dsh-turn-cost'
/** 本 bundle 在 profile 的 loader 条目 id（cordis.patch.yml 定死的那个），也是 settings 命名空间。 */
const SETTINGS_ENTRY_ID = 'dsh-turn-cost'
/** 卡片文案的 locale 命名空间。与面板共用一份词典，但独立注册，互不影响。 */
const SETTINGS_NS = 'dsh-project-memory.settings'

/**
 * 卡片编辑的字段；顺序即渲染顺序。
 *
 * 入选标准只有两条：**用户会主动想调**，且**调坏了不会让记忆失真**。
 *   - `autoIndexOnFirstUse`：换项目时最常见的诉求（"启动就把这里索引好"），默认关。
 *   - `watchInterval`：后台刷新唯一值得调的成本旋钮（频率）。监视本身**不提供关闭**——
 *     关掉之后记忆只会越来越旧，那不是一个选项，是一个坑。
 *   - `llmQueryExpansion`：唯一直接花 token 的开关，该由用户自己决定。
 * 刻意**没有**的：lazyIndexing、enableTypeScript、watch、memoryDir / roots / 扫描上限
 * （改的是数据落在哪，不属于"用户偏好"）。
 */
const SETTINGS_FIELDS = [
  'autoIndexOnFirstUse',
  'watchInterval',
  'llmQueryExpansion',
]

/** 布尔字段：草稿是 `'true'` / `'false'`，其它文本判为非法（挡住保存，而不是吞掉）。 */
function settingsBooleanField(field) {
  return {
    field,
    format: (value) => typeof value === 'boolean' ? String(value) : '',
    parse: (text) => text === 'true'
      ? { kind: 'set', value: true }
      : text === 'false'
        ? { kind: 'set', value: false }
        : undefined,
  }
}

/** 把 settings 命名空间桥到卡片的状态上。 */
class SettingsCardController {
  constructor(scope) {
    this.expanded = false
    this.form = new SettingsFormModel(scope, [
      settingsBooleanField('autoIndexOnFirstUse'),
      settingsNumberField('watchInterval'),
      settingsBooleanField('llmQueryExpansion'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  /** 构造槽位注入面。 */
  inject() {
    return {
      hooks: { settingsCard: this.store },
      toggleExpanded: () => {
        this.expanded = !this.expanded
        // 展开状态不进表单模型；投影自己推一次，别等 scope 变化。
        this.store.set(this.projection())
      },
      ...this.form.actions(),
    }
  }

  /** 释放对宿主命名空间的订阅。 */
  dispose() {
    this.form.dispose()
  }

  projection() {
    const fields = {}
    for (const field of SETTINGS_FIELDS) fields[field] = this.form.field(field)
    return { ...this.form.shell(), expanded: this.expanded, fields }
  }
}

/** 一行：左侧标题 + 说明，右侧控件（与宿主插件卡片的行同构）。 */
function SettingRow(props) {
  return h('div', { className: css.row },
    h('div', { className: css.labelBox },
      h('span', { className: css.label }, props.title),
      h('span', { className: css.hint }, props.hint)),
    h('div', { className: css.control }, props.children))
}

/** 宿主导出的"可渲染组件"：普通函数组件，或 `forwardRef` / `memo` 返回的对象。 */
function isComponent(value) {
  return typeof value === 'function' || (typeof value === 'object' && value !== null)
}

/** 渲染器缺钩子时的占位状态：卡片只显示标题，不读任何宿主值。 */
const UNAVAILABLE_STATE = {
  available: false,
  writable: false,
  dirty: false,
  invalid: false,
  saving: false,
  failed: false,
  expanded: false,
  fields: Object.fromEntries(
    SETTINGS_FIELDS.map((field) => [field, { text: '', overridden: false, invalid: false }]),
  ),
}

/** 非 Hook 的稳定回退：hook 数量在两次渲染之间不变，避免条件调用 Hooks。 */
const fallbackHook = (selector) => selector(UNAVAILABLE_STATE)

/** 渲染本 bundle 的常用设置。`summary` 视图不渲染。 */
function SettingsCard(props) {
  const t = props.t ?? createTranslate(zh)
  const useSettingsCard = props.useSettingsCard ?? fallbackHook
  // Hook 必须无条件调用：`summary` 只影响后面的返回，不影响 hook 顺序。
  const state = useSettingsCard((snapshot) => snapshot)
  const discard = props.discard
  // 离开页面时丢掉未保存的草稿（与宿主设置表单的约定一致；收起卡片不算离开）。
  useEffect(() => () => { discard?.() }, [discard])
  if (props.view === 'summary') return null
  const edit = props.edit
  const save = props.save
  if (edit === undefined || save === undefined) return null
  const disabled = !state.writable || state.saving
  const on = (field) => state.fields[field]?.text === 'true'
  const toggle = (field, next) => { edit(field, next ? 'true' : 'false') }
  const expanded = state.expanded === true
  const saveBlocked = !state.dirty || state.invalid || state.saving || !state.writable

  const header = h('button', {
    type: 'button',
    className: css.header,
    'aria-expanded': expanded,
    onClick: props.toggleExpanded,
  },
    h('span', { className: css.headText },
      h('span', { className: css.name }, t('settings.title')),
      h('span', { className: css.desc }, t('settings.subtitle'))),
    state.dirty ? h('span', { className: css.unsaved }, t('settings.unsaved')) : null,
    h('span', { className: expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron },
      h(IconChevronDownOutline14, null)))

  const body = expanded
    ? h('div', { className: css.body },
        state.available
          ? h('div', null,
              !state.writable ? h('p', { className: css.notice }, t('settings.form.readOnly')) : null,
              h(SettingRow, {
                title: t('settings.autoIndexOnFirstUse.title'),
                hint: t('settings.autoIndexOnFirstUse.hint'),
              }, h(Switch, {
                checked: on('autoIndexOnFirstUse'),
                disabled,
                label: t('settings.autoIndexOnFirstUse.title'),
                onChange: (next) => { toggle('autoIndexOnFirstUse', next) },
              })),
              h(SettingRow, {
                title: t('settings.watchInterval.title'),
                hint: t('settings.watchInterval.hint'),
              },
                h('input', {
                  className: css.number,
                  type: 'number',
                  min: 5,
                  max: 600,
                  step: 1,
                  inputMode: 'numeric',
                  'aria-label': t('settings.watchInterval.title'),
                  value: state.fields.watchInterval.text,
                  disabled,
                  'aria-invalid': state.fields.watchInterval.invalid || undefined,
                  onChange: (event) => { edit('watchInterval', event.target.value) },
                }),
                h('span', { className: css.unit }, t('settings.unit.seconds'))),
              h(SettingRow, {
                title: t('settings.llmQueryExpansion.title'),
                hint: t('settings.llmQueryExpansion.hint'),
              }, h(Switch, {
                checked: on('llmQueryExpansion'),
                disabled,
                label: t('settings.llmQueryExpansion.title'),
                onChange: (next) => { toggle('llmQueryExpansion', next) },
              })),
              h('div', { className: css.actions },
                state.failed ? h('p', { className: css.failed, role: 'status' }, t('settings.form.saveFailed')) : null,
                h(Button, {
                  variant: 'primary',
                  size: 'sm',
                  disabled: saveBlocked,
                  onClick: save,
                }, state.saving ? t('settings.form.saving') : t('settings.form.save'))))
          : h('p', { className: css.notice }, t('settings.form.unavailable')))
    : null

  return h('div', {
    className: expanded ? `${css.card} ${css.cardOpen}` : css.card,
    'data-project-memory-settings': true,
  }, header, body)
}

/**
 * 注册卡片（软依赖，永不抛出）。
 *
 * 两层门控：
 *   1. 嵌套 `inject(['slots','configForms','locale'])` —— 宿主没有设置服务时这里根本不跑；
 *   2. `configForms.whileServed([id])` + `slots.inject('plugins.bundle.config')`
 *      —— 命名空间没被宿主提供、或该版本没有这个槽时，不留下任何注册痕迹。
 */
function registerSettingsCard(ctx) {
  if (typeof ctx?.inject !== 'function') return
  // 没有 configForms = 这个宿主根本没有设置卡片能力（老宿主），静默跳过是正确降级。
  // 但它存在、slots/locale 却缺一个时，嵌套 inject 会永远不回调且不报错——这时必须点名。
  if (service(ctx, 'configForms')) {
    const missing = ['slots', 'configForms', 'locale'].filter((name) => !service(ctx, name))
    if (missing.length) {
      console.warn(`[${SETTINGS_NS}] settings card unavailable: missing client service(s) ${missing.join(', ')}`)
    }
  }
  try {
    ctx.inject(['slots', 'configForms', 'locale'], (scope) => {
      try {
        mountSettingsCard(scope)
      } catch (err) {
        console.warn(`[${SETTINGS_NS}] settings card registration failed:`, err)
      }
    })
  } catch (err) {
    console.warn(`[${SETTINGS_NS}] settings card injection failed:`, err)
  }
}

/** 在已就绪的 scope 上挂载卡片。 */
function mountSettingsCard(scope) {
  const slots = scope?.slots
  const configForms = scope?.configForms
  const locale = scope?.locale
  if (typeof slots?.inject !== 'function' || typeof configForms?.get !== 'function'
    || typeof configForms?.whileServed !== 'function' || typeof locale?.register !== 'function') return
  // 卡片的保存按钮 / 开关来自宿主 ui-primitives：缺任何一个都别注册，避免渲染时才炸。
  //
  // ⚠ 组件不等于函数：宿主用 `forwardRef` 包了 Button（导出是对象 `{ $$typeof, render }`），
  // 用 `typeof x === 'function'` 判定会把它当成"不存在"，卡片在真实宿主上整块消失。
  // 判定必须接受函数与对象两种导出形状。
  if (typeof SettingsFormModel !== 'function' || !isComponent(Switch) || !isComponent(Button)) {
    console.warn(`[${SETTINGS_NS}] host ui-primitives has no settings controls — visual settings disabled`)
    return
  }
  const effect = typeof scope.effect === 'function' ? scope.effect.bind(scope) : null
  const keep = (dispose) => {
    if (typeof dispose !== 'function' || effect === null) return
    effect(() => () => {
      try {
        dispose()
      } catch {
        // 宿主已经拆掉这层：忽略
      }
    })
  }
  try {
    keep(locale.register(SETTINGS_NS, { zh, en }))
  } catch (err) {
    // 同 namespace 已注册（HMR 没等到 disposer）：沿用既有词典，卡片照常挂。
    console.warn(`[${SETTINGS_NS}] locale dictionary already registered:`, err)
  }
  const controller = new SettingsCardController(configForms.get(SETTINGS_ENTRY_ID))
  keep(() => controller.dispose())
  keep(configForms.whileServed([SETTINGS_ENTRY_ID], () => slots.inject('plugins.bundle.config', () => slots.register({
    name: 'plugins.bundle.config',
    key: SETTINGS_PACKAGE_NAME,
    locale: SETTINGS_NS,
    inject: () => controller.inject(),
  }, SettingsCard))))
}
    __exports.SettingsCard = SettingsCard;
    __exports.registerSettingsCard = registerSettingsCard;
    __exports.SettingsCardController = SettingsCardController;
    __exports.SETTINGS_PACKAGE_NAME = SETTINGS_PACKAGE_NAME;
    __exports.SETTINGS_ENTRY_ID = SETTINGS_ENTRY_ID;
    __exports.SETTINGS_NS = SETTINGS_NS;
    __exports.SETTINGS_FIELDS = SETTINGS_FIELDS;
    };

    __modules["client-memory-src/slash.js"] = function (__exports, __req) {
const { translatorFor } = __req("./i18n.js");
const { IconChecklistOutline16, IconGlobeOutline16, IconLightOutline16 } = __req("./icons.js");
/** 源的稳定标识：同一 trigger 内唯一，重复注册会抛错。 */
const SLASH_SOURCE_NAME = 'project-memory';
/**
 * 组的排序权重（越小越靠前，未设时默认 0）。宿主内置源都取默认 0，所以 1 = 排在
 * 「指令 / 技能 / 子智能体」之后；其他插件若也留默认 0 会排在我们前面，1 是最接近的折中。
 */
const SLASH_SOURCE_ORDER = 1;
/** 菜单三行。顺序即渲染顺序；标题复用面板已有的 view.* 文案，保证与面板视图名一致。 */
const ROWS = [
    {
        labelKey: 'view.task',
        descriptionKey: 'slash.tasks-desc',
        icon: IconChecklistOutline16,
        match: ['tasks', 'task'],
        view: 'task',
    },
    {
        labelKey: 'view.project',
        descriptionKey: 'slash.project-desc',
        icon: IconLightOutline16,
        match: ['memory', 'project', 'insight'],
        view: 'project',
    },
    {
        labelKey: 'view.global',
        descriptionKey: 'slash.global-desc',
        icon: IconGlobeOutline16,
        match: ['memory', 'global', 'insight'],
        view: 'global',
    },
];
/**
 * 一轮候选：把三行装配成菜单行，再按查询与位置过滤。
 * 三行都不接参数（动作全在面板卡片里），所以位置过滤只做一件事：非 leading 位置不弹这一整组
 * （行内出现的 `/` 多半是路径）。
 * @param t - 翻译函数。
 * @param req - 宿主给的候选请求（query / position）。
 * @returns 菜单行；永不抛出。
 */
function buildSlashCandidates(t, req) {
    if (req?.position !== undefined && req.position !== 'leading')
        return [];
    const query = typeof req?.query === 'string' ? req.query.trim().toLowerCase() : '';
    const rows = ROWS.map((row) => {
        const title = t(row.labelKey);
        return {
            name: title,
            // label 与 name 相同 → MenuView 不渲染尾随别名（这些是视图入口，不是命令名）
            label: title,
            description: t(row.descriptionKey),
            icon: row.icon,
            // 每一行都带 section → MenuView 不渲染组标题行，只渲染这个标题。
            section: t('slash.group'),
            // **不带 line**：这三行不是命令，是打开面板某一页；动作在 onPick 里按 name 查表得到。
            terms: [title, ...row.match].map((term) => term.toLowerCase()),
        };
    });
    return rows
        .filter((row) => query === '' || row.terms.some((term) => term.startsWith(query)))
        .map(({ terms: _terms, ...candidate }) => candidate);
}
/**
 * 把触发 token 从草稿里删掉（span 做 CAS：草稿被改过就拒绝，什么都不动）。
 * 与宿主 command 源消费菜单点击是同一条契约事件。
 * @returns true 表示确实消费掉了。
 */
function consumeSpan(deps, pick) {
    try {
        const scope = deps.sessions?.scope?.(pick?.session?.sessionId);
        if (!scope || typeof scope.bail !== 'function')
            return false;
        return scope.bail(scope, 'slash/input-consume-token', {
            guard: { kind: 'span', span: pick.span },
        }) === true;
    }
    catch (err) {
        console.warn('[dsh-project-memory] slash token consume failed:', err);
        return false;
    }
}
/**
 * 一次菜单点击：消费掉触发 token 后**直接打开面板的对应页** —— 这三行是「打开某个视图」不是
 * 「执行命令」，`closed`/`view` 是浏览器侧状态；不返回 claim 是因为没有参数要填，消费失败仍切页。
 * @param t - 翻译函数（按当前语言把候选 name 映射回 ROWS）。
 * @param deps - 会话服务与 UI store 动作。
 * @param pick - 宿主给的点击载荷。
 * @returns PickOutcome；拿不到可用形状时返回 undefined（菜单照常关闭，草稿不动）。
 */
function dispatchSlashPick(t, deps, pick) {
    const title = pick?.candidate?.name;
    if (typeof title !== 'string' || title === '')
        return undefined;
    const row = ROWS.find((candidate) => t(candidate.labelKey) === title);
    if (row === undefined)
        return undefined;
    consumeSpan(deps, pick);
    try {
        deps.openView(row.view);
    }
    catch (err) {
        console.warn(`[dsh-project-memory] open view ${row.view} failed:`, err);
    }
    return 'handled';
}
/**
 * 造出注册给 `ctx.inputTriggers.registerSource` 的源对象。
 * @param ctx - client 根上下文（只读 locale）。
 * @param deps - 会话服务与命令执行通道。
 * @returns 触发器源；只依赖宿主的公开契约字段。
 */
function createSlashSource(ctx, deps) {
    const t = translatorFor(ctx);
    return {
        trigger: '/',
        name: SLASH_SOURCE_NAME,
        order: SLASH_SOURCE_ORDER,
        // 组标题不渲染：行上都有 section，MenuView 会用 section 标题取代它。
        showGroupTitle: false,
        candidates: async (_session, req) => buildSlashCandidates(t, req),
        onPick: (pick) => dispatchSlashPick(t, deps, pick),
    };
}
    __exports.buildSlashCandidates = buildSlashCandidates;
    __exports.dispatchSlashPick = dispatchSlashPick;
    __exports.createSlashSource = createSlashSource;
    __exports.SLASH_SOURCE_NAME = SLASH_SOURCE_NAME;
    __exports.SLASH_SOURCE_ORDER = SLASH_SOURCE_ORDER;
    };

    __modules["client-memory-src/styles.js"] = function (__exports, __req) {
/**
 * CSS 层：从原 rolldown bundle 中提取的压缩 CSS 与 hashed 类名映射。
 *
 * 为什么保留原样：CSS Modules 的类名是构建期 hashed 的（i54Wjq_ 前缀），
 * 手写组件不可能重新生成同一套 hash。直接复用同一份字符串与映射表，
 * 保证视觉与原来逐像素一致，也避免重写 1019 行 CSS 引入回归。
 *
 * 三份样式分别对应 TaskPanel.module.css / TaskCommandNode.module.css /
 * SettingsCard.module.css，与原包一一对应。
 */

const PANEL_CSS = ".i54Wjq_panel{pointer-events:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l2,#7f7f7f4d);border-radius:14px;flex-direction:column;width:380px;max-width:calc(100vw - 24px);max-height:min(70vh,640px);font-family:inherit;animation:.18s ease-out i54Wjq_panelIn;display:flex;position:fixed;overflow:hidden;box-shadow:0 12px 32px #00000029,0 2px 8px #00000014}@keyframes i54Wjq_panelIn{0%{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.i54Wjq_dragHandle{cursor:grab;z-index:1;justify-content:center;align-items:center;height:12px;display:flex;position:absolute;top:0;left:0;right:0}.i54Wjq_dragHandle:active{cursor:grabbing}.i54Wjq_handleGrip{background:var(--dsw-alias-separator-primary,#7f7f7f59);opacity:.8;border-radius:2px;width:32px;height:3px}.i54Wjq_header{border-bottom:1px solid var(--dsw-alias-border-l1,#7f7f7f2e);-webkit-user-select:none;user-select:none;justify-content:space-between;align-items:center;gap:8px;padding:10px 10px 8px 14px;display:flex}.i54Wjq_headerLeft{align-items:center;gap:6px;min-width:0;display:flex}.i54Wjq_headerIcon{color:var(--dsw-alias-label-secondary);flex:none}.i54Wjq_headerTitle{color:var(--dsw-alias-label-primary);white-space:nowrap;margin:0;font-size:13px;font-weight:600;line-height:20px}.i54Wjq_headerRight{align-items:center;gap:2px;margin-left:auto;display:flex}.i54Wjq_hintsOff{opacity:.45}.i54Wjq_hintsOff:hover{opacity:.75}.i54Wjq_counts{color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-right:4px;font-size:11px;line-height:16px}.i54Wjq_boundBadge{color:var(--dsw-alias-label-primary-foreground,#fff);background:var(--dsw-alias-button-primary-fill,#3a6ef5);white-space:nowrap;border-radius:7px;flex:none;padding:0 6px;font-size:10px;line-height:14px}.i54Wjq_notice{color:var(--dsw-alias-state-warn-label,#b7791f);background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1a);word-break:break-all;border-radius:8px;margin:8px 12px 0;padding:6px 10px;font-size:12px;line-height:18px}.i54Wjq_taskList{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,transparent) transparent;flex-direction:column;gap:6px;padding:8px;display:flex;overflow-y:auto}.i54Wjq_emptyState{text-align:center;color:var(--dsw-alias-label-secondary);padding:36px 24px 30px}.i54Wjq_emptyTitle{color:var(--dsw-alias-label-primary);margin:0 0 6px;font-size:13px;font-weight:600}.i54Wjq_emptyDesc{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:20px}.i54Wjq_syncHint{color:var(--dsw-alias-label-dimmed);justify-content:center;align-items:center;gap:6px;margin:10px 0 0;font-size:11px;display:flex}.i54Wjq_card{border:1px solid var(--dsw-alias-border-l1,#7f7f7f29);background:var(--dsw-alias-bg-base,transparent);content-visibility:auto;contain-intrinsic-size:auto 140px;border-radius:10px;transition:border-color .15s;overflow:hidden}.i54Wjq_cardBound{border-color:var(--dsw-alias-border-l3,#7f7f7f59);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3,transparent)}.i54Wjq_cardHead{cursor:pointer;text-align:left;background:0 0;border:none;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:8px 10px 7px;display:flex}.i54Wjq_cardHead:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_cardTitleRow{align-items:center;gap:6px;min-width:0;display:flex}.i54Wjq_cardTitle{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}.i54Wjq_cardMeta{color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;gap:8px;display:flex}.i54Wjq_progressText{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.i54Wjq_updated{color:var(--dsw-alias-label-dimmed);font-size:10px;line-height:14px}.i54Wjq_chevron{color:var(--dsw-alias-label-tertiary);display:inline-flex}.i54Wjq_track{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f);border-radius:1px;height:2px;margin:0 10px 6px;overflow:hidden}.i54Wjq_trackFill{background:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-button-primary-fill,#3a6ef5));border-radius:1px;height:100%;transition:width .2s}.i54Wjq_cardBody{border-top:1px solid var(--dsw-alias-border-l1,#7f7f7f24);overscroll-behavior:contain;max-height:300px;padding:8px 10px 10px;overflow-y:auto}.i54Wjq_section{margin-bottom:8px}.i54Wjq_section:last-child{margin-bottom:0}.i54Wjq_sectionLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;margin-bottom:4px;font-size:11px;line-height:16px;display:flex}.i54Wjq_sectionCount{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1a);color:var(--dsw-alias-label-tertiary);border-radius:6px;padding:0 5px;font-size:10px;line-height:14px}.i54Wjq_stepsList{flex-direction:column;gap:1px;margin:0;padding:0;list-style:none;display:flex}.i54Wjq_stepRow{align-items:flex-start;gap:7px;padding:3px 2px;display:flex}.i54Wjq_stepRow>svg{flex:none;margin-top:2px}.i54Wjq_stepDone{color:var(--dsw-alias-label-dimmed)}.i54Wjq_stepRun{color:var(--dsw-alias-label-primary-bluish,#3a6ef5)}.i54Wjq_stepPending{background:var(--dsw-alias-border-l3,#7f7f7f80);border-radius:50%;flex:none;width:8px;height:8px;margin:5px 3px}.i54Wjq_stepContent{color:var(--dsw-alias-label-secondary);word-break:break-word;white-space:pre-wrap;font-size:12px;line-height:20px}.i54Wjq_stepContentDone{color:var(--dsw-alias-label-dimmed);text-decoration:line-through}.i54Wjq_stepContentRun{color:var(--dsw-alias-label-primary)}.i54Wjq_muted{color:var(--dsw-alias-label-dimmed);font-size:11px;line-height:18px}.i54Wjq_filesList{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}.i54Wjq_fileRow{cursor:pointer;text-align:left;background:0 0;border:none;border-radius:6px;align-items:center;gap:6px;width:100%;padding:3px 4px;display:flex}.i54Wjq_fileRow:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_fileDot{background:var(--dsw-alias-border-l3,#7f7f7f80);border-radius:50%;flex:none;width:5px;height:5px}.i54Wjq_filePath{color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;text-align:left;direction:rtl;font-family:ui-monospace,SF Mono,Menlo,Consolas,monospace;font-size:11px;line-height:18px;overflow:hidden}.i54Wjq_fileLine{color:var(--dsw-alias-label-dimmed);flex:none;font-size:10px;line-height:18px}.i54Wjq_cardFooter{gap:6px;margin-top:8px;display:flex}@media (prefers-reduced-motion:reduce){.i54Wjq_panel{animation:none}.i54Wjq_trackFill,.i54Wjq_card{transition:none}}.i54Wjq_miniBar{border:1px solid var(--dsw-alias-border-l3,#7f7f7f4d);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));max-width:min(46vw,340px);height:34px;color:var(--dsw-alias-label-primary);cursor:grab;-webkit-user-select:none;user-select:none;pointer-events:auto;border-radius:999px;align-items:center;gap:7px;padding:0 12px;font-size:12px;line-height:18px;transition:background .15s,border-color .15s;display:inline-flex;position:fixed;box-shadow:0 6px 20px #00000024,0 1px 4px #00000014}.i54Wjq_miniBar:active{cursor:grabbing}.i54Wjq_miniBar:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_miniIcon{color:var(--dsw-alias-label-secondary);flex:none}.i54Wjq_miniText{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.i54Wjq_miniChevron{color:var(--dsw-alias-label-tertiary);flex:none}.i54Wjq_taskList{flex:auto;min-height:0}.i54Wjq_card{flex-direction:column;display:flex}.i54Wjq_boundaryFallback{border:1px solid var(--dsw-alias-border-l3,#7f7f7f4d);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary);cursor:pointer;pointer-events:auto;border-radius:999px;padding:4px 10px;font-size:12px;line-height:18px;position:fixed;top:64px;right:16px}.i54Wjq_stepToggle{cursor:pointer;background:0 0;border:none;border-radius:4px;flex:none;align-items:center;margin-top:2px;padding:0;display:inline-flex}.i54Wjq_stepToggle:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f)}.i54Wjq_stepToggle:disabled{cursor:default;opacity:.5}.i54Wjq_stepEditable{cursor:text;border-radius:3px}.i54Wjq_stepEditable:hover{outline:1px dashed var(--dsw-alias-border-l3,#7f7f7f66);outline-offset:1px}.i54Wjq_stepInput{box-sizing:border-box;width:auto;min-width:0;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--dsw-alias-border-l3,#7f7f7f73);border-radius:5px;flex:auto;padding:0 5px;font-size:12px;line-height:20px}.i54Wjq_editorArea{box-sizing:border-box;min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--dsw-alias-border-l3,#7f7f7f73);resize:none;vertical-align:middle;cursor:text;white-space:pre-wrap;word-break:break-word;border-radius:5px;flex:1;margin:0;padding:2px 5px;font-family:inherit;font-size:12px;line-height:20px;overflow:hidden}.i54Wjq_editorArea:focus{border-color:var(--dsw-alias-border-l3,#7f7f7f99);outline:none}.i54Wjq_stepDragging{opacity:.3;background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_cardTitleEditable{cursor:text;border-radius:3px}.i54Wjq_cardTitleEditable:hover{outline:1px dashed var(--dsw-alias-border-l3,#7f7f7f66);outline-offset:1px}.i54Wjq_panel[data-theme=glass],.i54Wjq_miniBar[data-theme=glass]{background:color-mix(in srgb, var(--dsw-alias-bg-layer-2,#fff) 90%, transparent);-webkit-backdrop-filter:blur(18px)saturate(1.2);border:1px solid color-mix(in srgb, var(--dsw-alias-border-l2,#7f7f7f4d) 80%, transparent)}.i54Wjq_panel[data-theme=glass] .i54Wjq_card{background:color-mix(in srgb, var(--dsw-alias-bg-base,transparent) 84%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-border-l1,#7f7f7f29) 60%, transparent)}.i54Wjq_panel[data-theme=glass] .i54Wjq_cardBody{border-top-color:color-mix(in srgb, var(--dsw-alias-border-l1,#7f7f7f24) 60%, transparent)}@media (prefers-reduced-transparency:reduce){.i54Wjq_panel[data-theme=glass],.i54Wjq_miniBar[data-theme=glass]{background:var(--dsw-alias-bg-layer-2,#fff);-webkit-backdrop-filter:none;backdrop-filter:none}.i54Wjq_panel[data-theme=glass] .i54Wjq_card{background:var(--dsw-alias-bg-base,transparent)}}@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.i54Wjq_panel[data-theme=glass],.i54Wjq_miniBar[data-theme=glass]{background:var(--dsw-alias-bg-layer-2,#fff)}}.i54Wjq_panel[data-theme=brutal]{box-shadow:none;border-width:1px;border-radius:6px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_card{border:1px solid var(--dsw-alias-border-l3,#7f7f7f6b);background:var(--dsw-alias-bg-base,transparent);box-shadow:none;border-radius:3px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_cardHead{padding:7px 10px 6px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_cardTitle{letter-spacing:.01em;font-weight:650}.i54Wjq_panel[data-theme=brutal] .i54Wjq_headerTitle{letter-spacing:.03em}.i54Wjq_panel[data-theme=brutal] .i54Wjq_boundBadge{border-radius:2px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_track{border-radius:0;height:3px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_trackFill{border-radius:0}.i54Wjq_panel[data-theme=brutal] .i54Wjq_cardBody{border-top:1px solid var(--dsw-alias-border-l2,#7f7f7f3d)}.i54Wjq_panel[data-theme=mono] .i54Wjq_headerTitle,.i54Wjq_panel[data-theme=mono] .i54Wjq_counts,.i54Wjq_panel[data-theme=mono] .i54Wjq_cardTitle,.i54Wjq_panel[data-theme=mono] .i54Wjq_progressText,.i54Wjq_panel[data-theme=mono] .i54Wjq_stepContent,.i54Wjq_panel[data-theme=mono] .i54Wjq_filePath{font-family:ui-monospace,SF Mono,Menlo,Consolas,Liberation Mono,monospace}.i54Wjq_panel[data-theme=mono] .i54Wjq_cardTitle{font-size:12px}.i54Wjq_panel[data-theme=mono] .i54Wjq_stepContent{font-size:11.5px}.i54Wjq_panel[data-theme=mono] .i54Wjq_card{border-radius:5px}.i54Wjq_panel[data-theme=mono] .i54Wjq_trackFill{border-radius:0}.i54Wjq_panel[data-theme=mono] .i54Wjq_stepPending{border-radius:1px}.i54Wjq_panel[data-theme=mono] .i54Wjq_updated{letter-spacing:.02em}.i54Wjq_headerIconBtn{color:inherit;cursor:pointer;background:0 0;border:none;border-radius:0;flex:none;justify-content:center;align-items:center;margin:0;padding:0;display:inline-flex}.i54Wjq_headerIcon{color:var(--dsw-alias-label-secondary);flex:none;display:block}.i54Wjq_headerLeft{min-width:0}.i54Wjq_headerTitle{text-overflow:ellipsis;flex:0 auto;min-width:0;overflow:hidden}.i54Wjq_headerRight{min-width:0}.i54Wjq_counts{text-overflow:ellipsis;flex:none;max-width:45%;margin-left:auto;overflow:hidden}.i54Wjq_dragGhost{pointer-events:none;z-index:9999;transition:left 50ms,top 50ms;position:fixed;transform:translate(-50%,-50%)}.i54Wjq_dragGhostCard{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l3,#7f7f7f59);color:var(--dsw-alias-label-primary);white-space:nowrap;border-radius:8px;align-items:center;gap:8px;max-width:280px;padding:8px 12px;font-size:12px;line-height:20px;display:inline-flex;transform:scale(.9);box-shadow:0 8px 24px #0000002e,0 2px 8px #0000001a}.i54Wjq_dragGhostContent{text-overflow:ellipsis;word-break:break-word;flex:1;min-width:0;overflow:hidden}.i54Wjq_dragGhostClose{width:20px;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:.6;background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;margin-left:8px;font-size:16px;line-height:1;transition:opacity .15s,background .15s,color .15s;display:inline-flex}.i54Wjq_dragGhostClose:hover{opacity:1;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f)}.i54Wjq_dropTargetBefore{position:relative}.i54Wjq_dropTargetBefore:before{content:\"\";background:var(--dsw-alias-button-primary-fill,#3a6ef5);height:2px;box-shadow:0 0 4px var(--dsw-alias-button-primary-fill,#3a6ef5);border-radius:1px;animation:.8s ease-in-out infinite i54Wjq_dropPulse;position:absolute;top:-1px;left:0;right:0}.i54Wjq_dropTargetAfter{position:relative}.i54Wjq_dropTargetAfter:after{content:\"\";background:var(--dsw-alias-button-primary-fill,#3a6ef5);height:2px;box-shadow:0 0 4px var(--dsw-alias-button-primary-fill,#3a6ef5);border-radius:1px;animation:.8s ease-in-out infinite i54Wjq_dropPulse;position:absolute;bottom:-1px;left:0;right:0}@keyframes i54Wjq_dropPulse{0%,to{opacity:.6}50%{opacity:1}}.i54Wjq_memoryPane{flex-direction:column;gap:6px;max-height:480px;padding:8px 10px 10px;display:flex;overflow:auto}.i54Wjq_memToolbar{justify-content:space-between;align-items:center;gap:8px;display:flex}.i54Wjq_memCount{opacity:.75;font-size:12px;font-weight:600}.i54Wjq_memList{flex-direction:column;gap:6px;display:flex}.i54Wjq_memSentinel{flex:none;height:1px}.i54Wjq_memFooter{flex-direction:column;align-items:center;gap:4px;padding:6px 0 2px;font-size:12px;display:flex}.i54Wjq_memRow{border:1px solid var(--dsw-border-weak,#80808040);background:color-mix(in srgb, var(--dsw-bg-secondary,#f5f5f5) 45%, transparent);content-visibility:auto;contain-intrinsic-size:auto 76px;border-radius:6px;flex-direction:column;gap:4px;padding:6px 8px;display:flex}.i54Wjq_memRowArchived{opacity:.55}.i54Wjq_memRowMain{flex-direction:column;gap:2px;display:flex}.i54Wjq_memTitle{word-break:break-word;align-items:flex-start;gap:6px;font-size:13px;line-height:1.35;display:flex}.i54Wjq_kindBadge{background:var(--dsw-accent-soft,#5078ff26);color:var(--dsw-accent,#4d6bfe);border-radius:4px;flex:none;padding:0 5px;font-size:11px;line-height:1.5}.i54Wjq_memMeta{flex-wrap:wrap;align-items:center;gap:4px;display:flex}.i54Wjq_badge{background:color-mix(in srgb, var(--dsw-fg,#222) 8%, transparent);border-radius:4px;padding:0 5px;font-size:11px;line-height:1.5}.i54Wjq_badgeDraft{color:#b26a00;background:#ffb40029}.i54Wjq_badgeArchived{opacity:.8}.i54Wjq_memBody{opacity:.8;word-break:break-word;font-size:12px}.i54Wjq_memActs{flex-wrap:wrap;gap:4px;display:flex}.i54Wjq_memToolbarActs{align-items:center;gap:6px;display:flex}.i54Wjq_memNew{border:1px solid var(--dsw-border-weak,#80808040);border-radius:6px;flex-direction:column;gap:6px;padding:8px;display:flex}.i54Wjq_memNewRow{align-items:center;gap:8px;display:flex}.i54Wjq_memLabel{opacity:.8;align-items:center;gap:6px;font-size:12px;display:inline-flex}.i54Wjq_memNew select,.i54Wjq_memNew textarea{box-sizing:border-box;width:100%}";
const CMD_CSS = "._9r5h7a_row{max-width:100%;color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;align-items:center;gap:6px;padding:2px 0;font-size:12px;line-height:20px;display:inline-flex;overflow:hidden}._9r5h7a_row[data-variant=ok]{color:var(--dsw-alias-label-secondary)}._9r5h7a_row[data-variant=error]{color:var(--dsw-alias-state-warn-label,#b7791f)}._9r5h7a_row[data-variant=running]{color:var(--dsw-alias-label-dimmed)}._9r5h7a_icon{color:var(--dsw-alias-label-tertiary);flex:none}";
const SETTINGS_CSS = ".CSjuLW_card{box-sizing:border-box;border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l4,#00000029));border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s}.CSjuLW_card:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.CSjuLW_cardOpen{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.CSjuLW_header{-webkit-appearance:none;appearance:none;border-radius:inherit;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:12px;padding:14px 16px;display:flex}.CSjuLW_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}.CSjuLW_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.CSjuLW_name{color:var(--dsw-alias-label-primary,#1f2328);font-size:15px;font-weight:600;line-height:1.4}.CSjuLW_desc{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:1.5}.CSjuLW_unsaved{color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-bg-module-platform,#eef0f4);border-radius:9px;flex:none;padding:0 6px;font-size:11px;font-weight:600;line-height:17px}.CSjuLW_chevron{color:var(--dsw-alias-label-tertiary,#8b93a1);flex:none;transition:transform .16s;display:inline-flex}.CSjuLW_chevronOpen{transform:rotate(180deg)}.CSjuLW_body{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding-bottom:8px}.CSjuLW_row{align-items:center;gap:12px;padding:12px 0;display:flex}.CSjuLW_row+.CSjuLW_row{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb)}.CSjuLW_labelBox{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}.CSjuLW_label{color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}.CSjuLW_hint{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}.CSjuLW_control{flex:none;align-items:center;gap:6px;display:flex}.CSjuLW_number{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#d1d5db);background:var(--dsw-alias-bg-layer-3,#fff);width:84px;font:inherit;color:var(--dsw-alias-label-primary,#1f2328);text-align:right;border-radius:7px;padding:6px 8px;font-size:12px;line-height:18px}.CSjuLW_number:disabled{opacity:.5;cursor:default}.CSjuLW_number:focus{border-color:var(--dsw-alias-brand-primary,#4f6ef7);outline:2px solid color-mix(in srgb, var(--dsw-alias-brand-primary,#4f6ef7) 18%, transparent)}.CSjuLW_number[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary,#dc2626)}.CSjuLW_unit{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}.CSjuLW_actions{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.CSjuLW_failed{min-width:0;color:var(--dsw-alias-label-error,#dc2626);flex:1;margin:0;font-size:12px;line-height:18px}.CSjuLW_notice{color:var(--dsw-alias-label-tertiary,#8b93a1);margin:0;padding:12px 0;font-size:12px;line-height:18px}";

const TAG_PREFIX = "@local/dsh-turn-cost/memory";

/** 注入一份 CSS（幂等：同 id 复用同一个 <style>，更新时只换 textContent）。 */
function injectStyle(id, css, plugin) {
  if (typeof document === "undefined") return;
  const selector = "style[data-plugin-css=" + JSON.stringify(id) + "]";
  const existing = document.querySelector(selector);
  if (existing) { existing.textContent = css; return; }
  const tag = document.createElement("style");
  tag.dataset.plugin = plugin;
  tag.dataset.pluginCss = id;
  tag.textContent = css;
  document.head.appendChild(tag);
}

function ensureMemoryStyles() {
  injectStyle(TAG_PREFIX + "/TaskPanel.module.css", PANEL_CSS, "@local/dsh-turn-cost");
  injectStyle(TAG_PREFIX + "/TaskCommandNode.module.css", CMD_CSS, "@local/dsh-turn-cost");
  injectStyle(TAG_PREFIX + "/SettingsCard.module.css", SETTINGS_CSS, "@local/dsh-turn-cost");
}

/** TaskPanel.module.css 的 hashed 类名映射（88 项）。 */
const css = {
  "badge": "i54Wjq_badge",
  "badgeArchived": "i54Wjq_badgeArchived",
  "badgeDraft": "i54Wjq_badgeDraft",
  "boundBadge": "i54Wjq_boundBadge",
  "boundaryFallback": "i54Wjq_boundaryFallback",
  "card": "i54Wjq_card",
  "cardBody": "i54Wjq_cardBody",
  "cardBound": "i54Wjq_cardBound",
  "cardFooter": "i54Wjq_cardFooter",
  "cardHead": "i54Wjq_cardHead",
  "cardMeta": "i54Wjq_cardMeta",
  "cardTitle": "i54Wjq_cardTitle",
  "cardTitleEditable": "i54Wjq_cardTitleEditable",
  "cardTitleRow": "i54Wjq_cardTitleRow",
  "chevron": "i54Wjq_chevron",
  "counts": "i54Wjq_counts",
  "dragGhost": "i54Wjq_dragGhost",
  "dragGhostCard": "i54Wjq_dragGhostCard",
  "dragGhostClose": "i54Wjq_dragGhostClose",
  "dragGhostContent": "i54Wjq_dragGhostContent",
  "dragHandle": "i54Wjq_dragHandle",
  "dropPulse": "i54Wjq_dropPulse",
  "dropTargetAfter": "i54Wjq_dropTargetAfter",
  "dropTargetBefore": "i54Wjq_dropTargetBefore",
  "editorArea": "i54Wjq_editorArea",
  "emptyDesc": "i54Wjq_emptyDesc",
  "emptyState": "i54Wjq_emptyState",
  "emptyTitle": "i54Wjq_emptyTitle",
  "fileDot": "i54Wjq_fileDot",
  "fileLine": "i54Wjq_fileLine",
  "filePath": "i54Wjq_filePath",
  "fileRow": "i54Wjq_fileRow",
  "filesList": "i54Wjq_filesList",
  "handleGrip": "i54Wjq_handleGrip",
  "header": "i54Wjq_header",
  "headerIcon": "i54Wjq_headerIcon",
  "headerIconBtn": "i54Wjq_headerIconBtn",
  "headerLeft": "i54Wjq_headerLeft",
  "headerRight": "i54Wjq_headerRight",
  "headerTitle": "i54Wjq_headerTitle",
  "hintsOff": "i54Wjq_hintsOff",
  "kindBadge": "i54Wjq_kindBadge",
  "memActs": "i54Wjq_memActs",
  "memBody": "i54Wjq_memBody",
  "memCount": "i54Wjq_memCount",
  "memFooter": "i54Wjq_memFooter",
  "memLabel": "i54Wjq_memLabel",
  "memList": "i54Wjq_memList",
  "memMeta": "i54Wjq_memMeta",
  "memNew": "i54Wjq_memNew",
  "memNewRow": "i54Wjq_memNewRow",
  "memRow": "i54Wjq_memRow",
  "memRowArchived": "i54Wjq_memRowArchived",
  "memRowMain": "i54Wjq_memRowMain",
  "memSentinel": "i54Wjq_memSentinel",
  "memTitle": "i54Wjq_memTitle",
  "memToolbar": "i54Wjq_memToolbar",
  "memToolbarActs": "i54Wjq_memToolbarActs",
  "memoryPane": "i54Wjq_memoryPane",
  "miniBar": "i54Wjq_miniBar",
  "miniChevron": "i54Wjq_miniChevron",
  "miniIcon": "i54Wjq_miniIcon",
  "miniText": "i54Wjq_miniText",
  "muted": "i54Wjq_muted",
  "notice": "i54Wjq_notice",
  "panel": "i54Wjq_panel",
  "panelIn": "i54Wjq_panelIn",
  "progressText": "i54Wjq_progressText",
  "section": "i54Wjq_section",
  "sectionCount": "i54Wjq_sectionCount",
  "sectionLabel": "i54Wjq_sectionLabel",
  "stepContent": "i54Wjq_stepContent",
  "stepContentDone": "i54Wjq_stepContentDone",
  "stepContentRun": "i54Wjq_stepContentRun",
  "stepDone": "i54Wjq_stepDone",
  "stepDragging": "i54Wjq_stepDragging",
  "stepEditable": "i54Wjq_stepEditable",
  "stepInput": "i54Wjq_stepInput",
  "stepPending": "i54Wjq_stepPending",
  "stepRow": "i54Wjq_stepRow",
  "stepRun": "i54Wjq_stepRun",
  "stepToggle": "i54Wjq_stepToggle",
  "stepsList": "i54Wjq_stepsList",
  "syncHint": "i54Wjq_syncHint",
  "taskList": "i54Wjq_taskList",
  "track": "i54Wjq_track",
  "trackFill": "i54Wjq_trackFill",
  "updated": "i54Wjq_updated"
};
/** TaskCommandNode.module.css 的 hashed 类名映射。 */
const cmdCss = {
  "icon": "_9r5h7a_icon",
  "row": "_9r5h7a_row"
};
/** SettingsCard.module.css 的 hashed 类名映射（20 项）。 */
const settingsCss = {
  "actions": "CSjuLW_actions",
  "body": "CSjuLW_body",
  "card": "CSjuLW_card",
  "cardOpen": "CSjuLW_cardOpen",
  "chevron": "CSjuLW_chevron",
  "chevronOpen": "CSjuLW_chevronOpen",
  "control": "CSjuLW_control",
  "desc": "CSjuLW_desc",
  "failed": "CSjuLW_failed",
  "headText": "CSjuLW_headText",
  "header": "CSjuLW_header",
  "hint": "CSjuLW_hint",
  "label": "CSjuLW_label",
  "labelBox": "CSjuLW_labelBox",
  "name": "CSjuLW_name",
  "notice": "CSjuLW_notice",
  "number": "CSjuLW_number",
  "row": "CSjuLW_row",
  "unit": "CSjuLW_unit",
  "unsaved": "CSjuLW_unsaved"
};
    __exports.ensureMemoryStyles = ensureMemoryStyles;
    __exports.PANEL_CSS = PANEL_CSS;
    __exports.CMD_CSS = CMD_CSS;
    __exports.SETTINGS_CSS = SETTINGS_CSS;
    __exports.css = css;
    __exports.cmdCss = cmdCss;
    __exports.settingsCss = settingsCss;
    };

    __modules["client-memory-src/task-data-store.js"] = function (__exports, __req) {
/**
 * Task Data Store — 仅管服务端同步的数据（tasks、boundTaskId、archivedCount）
 * - 单向数据流：命令执行结果 → setTasks → 广播给其他标签页
 * - 无 UI 状态，无 localStorage，纯内存 + BroadcastChannel 同步
 */
const { useSyncExternalStore } = __req("react");
const { broadcastAppliesTo, payloadRoot } = __req("./task-scope.js");
function parseTaskPayloadText(text) {
    if (!text)
        return null;
    let jsonBlock = null;
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fenced)
        jsonBlock = fenced[1];
    else {
        const lastBrace = text.lastIndexOf('{');
        if (lastBrace !== -1)
            jsonBlock = text.slice(lastBrace);
    }
    if (!jsonBlock)
        return null;
    try {
        const data = JSON.parse(jsonBlock);
        if (!Array.isArray(data.tasks))
            return null;
        return {
            tasks: data.tasks,
            boundId: data.boundId ?? null,
            archived: data.archived ?? 0,
            root: payloadRoot(data.root),
        };
    }
    catch {
        return null;
    }
}
// 不是所有宿主都有 BroadcastChannel（SSR / 老 WebView / 测试替身）。缺它只关闭跨标签页同步，
// 不能让整个 client 半边在 apply 之前就 ReferenceError。
const SYNC_CHANNEL = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('dsh-pm-tasks-data')
    : null;
let dataState = {
    tasks: [],
    boundTaskId: null,
    archivedCount: 0,
    root: null,
    sessionId: null,
    lastSyncAt: 0,
    lastUpdate: 0,
};
const dataListeners = new Set();
function setDataState(next) {
    // 兼容对象与函数式 updater（BroadcastChannel 曾误把 updater 当对象写入，
    // 导致 dataState 变成函数、tasks 丢失 → 面板崩溃）。写入一律归一化为完整 shape。
    const patch = typeof next === 'function' ? next(dataState) : next;
    dataState = {
        tasks: Array.isArray(patch?.tasks) ? patch.tasks : [],
        boundTaskId: patch?.boundTaskId ?? null,
        archivedCount: typeof patch?.archivedCount === 'number' ? patch.archivedCount : 0,
        root: payloadRoot(patch?.root),
        sessionId: typeof patch?.sessionId === 'string' && patch.sessionId ? patch.sessionId : null,
        lastSyncAt: typeof patch?.lastSyncAt === 'number' ? patch.lastSyncAt : 0,
        lastUpdate: typeof patch?.lastUpdate === 'number' ? patch.lastUpdate : 0,
    };
    for (const listener of dataListeners)
        listener();
}
function broadcastDataUpdate(tasks, archivedCount, root, boundTaskId, sessionId, sentAt) {
    if (!SYNC_CHANNEL)
        return;
    SYNC_CHANNEL.postMessage({
        type: 'PROJECT_TASKS_UPDATED',
        payload: {
            tasks: Array.isArray(tasks) ? tasks : [],
            archivedCount,
            root,
            boundTaskId,
            sessionId,
            sentAt,
        },
    });
}
if (SYNC_CHANNEL) {
    SYNC_CHANNEL.onmessage = (event) => {
        const msg = event.data;
        if (msg?.type !== 'PROJECT_TASKS_UPDATED' || !msg.payload)
            return;
        const { tasks, archivedCount, root, boundTaskId, sessionId, sentAt } = msg.payload;
        // 频道名是固定的（同一浏览器同源的所有 dsh 页面共用一个），所以**必须**按项目根过滤：
        // 否则在 A 项目点一下刷新，B 项目的标签页面板就被贴上 A 的任务列表（而它还保留自己的
        // boundTaskId，看起来像"绑定丢了"）。两侧都已知根且不同 → 丢弃；本页还不知道根（还没
        // 同步过）→ 也丢弃，让它自己那一次 /tasks 决定归属，不先借别人的数据。
        if (!broadcastAppliesTo(dataState.root, root))
            return;
        // 同一浏览器的时钟可比：晚到的旧快照不能把新状态盖回去。
        if (typeof sentAt === 'number' && sentAt < dataState.lastSyncAt)
            return;
        setDataState(prev => ({
            ...prev,
            tasks: Array.isArray(tasks) ? tasks : [],
            archivedCount: typeof archivedCount === 'number' ? archivedCount : prev.archivedCount,
            // 只在同一会话内同步绑定：同项目不同会话的任务列表可以共享，绑定不能互相覆盖。
            ...(sessionId && prev.sessionId && sessionId === prev.sessionId
                ? { boundTaskId: typeof boundTaskId === 'string' ? boundTaskId : null }
                : {}),
            lastSyncAt: typeof sentAt === 'number' ? sentAt : prev.lastSyncAt,
            lastUpdate: Date.now(),
        }));
    };
}
const taskDataStore = {
    subscribe(listener) {
        dataListeners.add(listener);
        return () => { dataListeners.delete(listener); };
    },
    getSnapshot() {
        return dataState;
    },
    actions: {
        setTasks(payload) {
            const nextTasks = payload.tasks || [];
            const nextArchived = payload.archivedCount ?? 0;
            const nextRoot = payloadRoot(payload.root);
            // 未提供 sessionId 的调用点（命令节点）不能把已有会话清空，否则绑定同步被顺手关掉。
            const nextSession = payload.sessionId === undefined
                ? dataState.sessionId
                : (typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : null);
            const sentAt = Date.now();
            setDataState({
                tasks: nextTasks,
                boundTaskId: payload.boundTaskId ?? null,
                archivedCount: nextArchived,
                root: nextRoot,
                sessionId: nextSession,
                lastSyncAt: sentAt,
                lastUpdate: sentAt,
            });
            broadcastDataUpdate(nextTasks, nextArchived, nextRoot, payload.boundTaskId ?? null, nextSession, sentAt);
        },
        reset() {
            setDataState({
                tasks: [],
                boundTaskId: null,
                archivedCount: 0,
                root: null,
                sessionId: null,
                lastSyncAt: 0,
                lastUpdate: 0,
            });
        },
    },
};
function useTaskData() {
    return useSyncExternalStore(taskDataStore.subscribe, taskDataStore.getSnapshot, taskDataStore.getSnapshot);
}
function useTaskDataActions() {
    return taskDataStore.actions;
}
    __exports.parseTaskPayloadText = parseTaskPayloadText;
    __exports.useTaskData = useTaskData;
    __exports.useTaskDataActions = useTaskDataActions;
    __exports.taskDataStore = taskDataStore;
    };

    __modules["client-memory-src/task-hooks.js"] = function (__exports, __req) {
/**
 * Task Panel Hooks — 步骤拖拽交互逻辑（useTaskDrag）。
 * 只依赖 react + task-data-store 类型，不碰数据/UI store。
 */
const { useEffect, useRef, useState, useCallback } = __req("react");
/**
 * useTaskDrag — 步骤拖拽重排（绑定任务内，同一任务卡的步骤行间移动）。
 *
 * 交互模型（拖动全程按住鼠标）：
 *  - 步骤行上按下（左键、非按钮/输入区域）→ 进入预览；
 *  - 按住 350ms 不松，或按住后移动超过 6px → 唤起跟随鼠标的浮动幽灵卡片；
 *  - 幽灵悬停到本任务卡内的步骤行时显示蓝色插入线（上半=插到该行前，下半=插到该行后）；
 *  - 松手（mouseup）：落在有效位置 → onReorder 落子；落在卡外/别的任务卡/原行
 *    （插入自身前后）/按钮输入等控件上 → 取消；
 *  - 350ms 内原地松手 = 普通点击，不产生幽灵；Esc → 取消。
 */
function useTaskDrag(taskId, isBound, onReorder) {
    const [dragState, setDragState] = useState(null);
    const [dropTargetIndex, setDropTargetIndex] = useState(null);
    // 最新值镜像：拖拽期间 window 监听只在“会话开始/结束”时挂载/卸载，
    // 避免每次 mousemove 更新状态导致监听器重挂、连 350ms 定时器都被清掉。
    const dragRef = useRef(dragState);
    dragRef.current = dragState;
    const longPressTimer = useRef(undefined);
    const dragOrigin = useRef(null);
    const clearTimer = useCallback(() => {
        if (longPressTimer.current !== undefined) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = undefined;
        }
    }, []);
    const cancelDrag = useCallback(() => {
        clearTimer();
        dragOrigin.current = null;
        document.body.style.userSelect = '';
        setDropTargetIndex(null);
        setDragState(null);
    }, [clearTimer]);
    const startDrag = useCallback((fromIndex, stepContent, e) => {
        if (!isBound || e.button !== 0)
            return;
        if (dragRef.current)
            return; // 已有预览/拖拽会话
        e.preventDefault();
        e.stopPropagation();
        document.body.style.userSelect = 'none';
        dragOrigin.current = { x: e.clientX, y: e.clientY };
        setDropTargetIndex(null);
        setDragState({ fromIndex, stepContent, clientX: e.clientX, clientY: e.clientY, dragging: false });
        clearTimer();
        longPressTimer.current = window.setTimeout(() => {
            longPressTimer.current = undefined;
            // 350ms 长按 → 唤起幽灵卡片
            setDragState(prev => (prev ? { ...prev, dragging: true } : null));
        }, 350);
    }, [isBound, clearTimer]);
    /** 计算某行上 y 坐标对应的插入位（行数下标：上半=该行前，下半=该行后）；非本任务卡返回 null */
    const dropIndexAt = useCallback((row, clientY) => {
        const parentOl = row.closest('ol');
        if (!parentOl || !parentOl.closest(`article[data-task-id="${taskId}"]`))
            return null;
        const index = Array.from(parentOl.children).indexOf(row);
        const rect = row.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2 ? index : index + 1;
    }, [taskId]);
    /** 在 (x,y) 处结算：命中有效落点则重排，否则取消；并结束本次拖拽 */
    const commitDrop = useCallback((x, y) => {
        const cur = dragRef.current;
        if (!cur || !cur.dragging)
            return;
        const el = document.elementFromPoint(x, y);
        // 松手点在按钮/输入等交互控件上：不落子，直接取消
        if (el && !el.closest('button, input, textarea, a')) {
            const row = el.closest('[data-step-row]');
            if (row) {
                const drop = dropIndexAt(row, y);
                if (drop !== null) {
                    // 行下标形式的落点：插到目标行前/后；落在自身原位视为取消（不产生空推送）
                    const effective = drop > cur.fromIndex ? drop - 1 : drop;
                    if (effective !== cur.fromIndex)
                        onReorder(cur.fromIndex, drop);
                }
            }
        }
        cancelDrag();
    }, [dropIndexAt, onReorder, cancelDrag]);
    const active = dragState !== null;
    useEffect(() => {
        if (!active)
            return;
        const onMouseMove = (e) => {
            const cur = dragRef.current;
            if (!cur)
                return;
            if (!cur.dragging) {
                // 未到 350ms：移动超过阈值视为拖拽开始（不必死等长按）
                const origin = dragOrigin.current;
                if (!origin)
                    return;
                if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 6)
                    return;
                clearTimer();
                setDragState(prev => (prev ? { ...prev, dragging: true, clientX: e.clientX, clientY: e.clientY } : null));
            }
            else {
                setDragState(prev => (prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null));
            }
            const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-step-row]');
            setDropTargetIndex(row ? dropIndexAt(row, e.clientY) : null);
        };
        const onMouseUp = (e) => {
            const cur = dragRef.current;
            if (!cur)
                return;
            if (cur.dragging) {
                // 拖拽中松手 = 落子/取消
                commitDrop(e.clientX, e.clientY);
            }
            else {
                // 350ms 内原地松手 = 普通点击
                cancelDrag();
            }
        };
        const onClick = (e) => {
            // 兜底：mouseup 发生在窗口外等情况时，下一次点击直接结算
            const cur = dragRef.current;
            if (!cur || !cur.dragging)
                return;
            commitDrop(e.clientX, e.clientY);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape')
                cancelDrag();
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('click', onClick, true);
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.userSelect = '';
        };
    }, [active, taskId, dropIndexAt, onReorder, cancelDrag, commitDrop]);
    useEffect(() => () => clearTimer(), [clearTimer]);
    return { dragState, dropTargetIndex, startDrag, cancelDrag };
}
    __exports.useTaskDrag = useTaskDrag;
    };

    __modules["client-memory-src/task-scope.js"] = function (__exports, __req) {
/**
 * 跨标签页任务广播的**项目作用域**判定（纯函数，无 React / 无 BroadcastChannel 依赖）。
 *
 * 为什么需要它：同步频道名是固定的（同一浏览器同源的所有 dsh 页面共用一个
 * `dsh-pm-tasks-data`），而消息体只带任务数组。没有作用域判定时，在 A 项目点一下刷新，
 * B 项目的标签页面板就会被贴上 A 的任务列表——它自己保留着 B 的 `boundTaskId`，
 * 于是表现为"绑定莫名丢了"。频道名不能按项目拆：项目根是数据到达后才知道的，
 * 而 `new BroadcastChannel` 在模块加载期就要定名。
 *
 * 判据刻意**严格**：消息里没有根、或本页还没确定根，都不接受。
 *  - 无根：老宿主/老 bundle 的载荷，宁可不同步也不猜；
 *  - 本页未知根：它自己那一次 `/tasks` 会决定归属，不先借别人的数据（避免短暂显示错项目）。
 * 两侧都已知且相等时才接受——这正是"同一项目的两个标签页"。
 *
 * @param {string|null|undefined} localRoot - 本页当前数据的项目根（未同步过为 null）
 * @param {unknown} incomingRoot - 广播消息里的项目根
 * @returns {boolean} true = 这条广播属于同一个项目，可以套用
 */
function broadcastAppliesTo(localRoot, incomingRoot) {
    if (typeof incomingRoot !== 'string' || incomingRoot === '')
        return false;
    if (typeof localRoot !== 'string' || localRoot === '')
        return false;
    return rootKey(localRoot) === rootKey(incomingRoot);
}
/** Windows/macOS 的文件系统大小写不敏感；Linux 上不能把两个只差大小写的根当成一个。 */
function caseInsensitiveFs() {
    const platform = typeof navigator !== 'undefined' ? String(navigator.platform || '') : '';
    if (/win/i.test(platform) || /mac/i.test(platform))
        return true;
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    return /Windows|Macintosh/i.test(ua);
}
/** 根的规范键：统一分隔符、去掉末尾分隔符；大小写不敏感平台再折叠大小写。 */
function rootKey(root) {
    let key = String(root).replace(/\\/g, '/');
    if (key.length > 1)
        key = key.replace(/\/+$/, '');
    return caseInsensitiveFs() ? key.toLowerCase() : key;
}
/**
 * 从 `/tasks` 载荷里取项目根（旧宿主没有该键）。
 * @param {unknown} value - `payload.root`
 * @returns {string|null} 非空字符串才算根
 */
function payloadRoot(value) {
    return typeof value === 'string' && value !== '' ? value : null;
}
    __exports.broadcastAppliesTo = broadcastAppliesTo;
    __exports.payloadRoot = payloadRoot;
    };

    __modules["client-memory-src/task-ui-store.js"] = function (__exports, __req) {
/**
 * Task UI Store — 仅管本地 UI 状态（closed、minimized、position、expandedTaskIds、theme、showHints）
 * - 持久化到 localStorage（key: dsh-pm-task-panel-ui）
 * - 不跨标签页同步（每个标签页独立）
 * - 启动/刷新强制 closed: true，面板默认不显示
 */
const { useSyncExternalStore } = __req("react");
const STORAGE_KEY = 'dsh-pm-task-panel-ui';
/**
 * 面板的三个视图页。**单一事实来源**：面板的切页按钮与 `/` 菜单的三行都读它。
 * 两边各抄一份必然漂移 —— 实测就是这样：菜单行去执行宿主命令"开记忆页"，而面板的 view
 * 是组件内部 state，谁也够不着它，于是点击没有任何可见效果。
 */
const PANEL_VIEWS = ['task', 'project', 'global'];
/** 把任意值收敛成一个合法视图页（脏 localStorage / 外部传入都要过这一关）。 */
function normalizeView(value) {
    return PANEL_VIEWS.includes(value) ? value : 'task';
}
function defaultPosition() {
    if (typeof window !== 'undefined') {
        return { x: Math.max(16, window.innerWidth - 408), y: 72 };
    }
    return { x: 0, y: 0 };
}
/** 位置必须留在视口内：换小屏/拔掉外接屏后，持久化的坐标可能已经看不见。 */
function clampPosition(value) {
    if (typeof window === 'undefined')
        return defaultPosition();
    const pos = value;
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return defaultPosition();
    return {
        x: Math.max(8, Math.min(x, window.innerWidth - 80)),
        y: Math.max(8, Math.min(y, window.innerHeight - 40)),
    };
}
/**
 * 启动时的初始状态：
 * - closed 恒为 true（不读取 localStorage 的 closed），刷新后面板隐藏；
 * - 其余（展开项/位置/主题）可恢复上次会话偏好，minimized 默认折叠成迷你条。
 */
function getDefaultUIState() {
    if (typeof window !== 'undefined') {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    expandedTaskIds: Array.isArray(parsed.expandedTaskIds) ? parsed.expandedTaskIds : [],
                    panelPosition: clampPosition(parsed.panelPosition),
                    minimized: parsed.minimized !== false,
                    closed: true,
                    theme: typeof parsed.theme === 'string' ? parsed.theme : 'native',
                    showHints: parsed.showHints !== false,
                    // 视图页可恢复：它是"上次在看哪一页"，刷新后仍该停在那里（与 closed 不同）。
                    view: normalizeView(parsed.view),
                };
            }
        }
        catch { /* corrupt state — fall through to defaults */ }
    }
    return {
        expandedTaskIds: [],
        panelPosition: defaultPosition(),
        minimized: true,
        closed: true,
        theme: 'native',
        showHints: true,
        view: 'task',
    };
}
function persistUI(state) {
    if (typeof window === 'undefined')
        return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch { /* storage full/unavailable — non-fatal */ }
}
let uiState = getDefaultUIState();
const uiListeners = new Set();
function setUIState(next) {
    uiState = next;
    persistUI(next);
    for (const listener of uiListeners)
        listener();
}
const taskUIStore = {
    subscribe(listener) {
        uiListeners.add(listener);
        return () => { uiListeners.delete(listener); };
    },
    getSnapshot() {
        return uiState;
    },
    actions: {
        toggleTaskExpanded(taskId) {
            const prev = uiState;
            const ids = prev.expandedTaskIds.includes(taskId)
                ? prev.expandedTaskIds.filter((id) => id !== taskId)
                : [...prev.expandedTaskIds, taskId];
            setUIState({ ...prev, expandedTaskIds: ids });
        },
        expandAll(taskIds) {
            setUIState({ ...uiState, expandedTaskIds: taskIds });
        },
        setPanelPosition(pos) {
            setUIState({ ...uiState, panelPosition: clampPosition(pos) });
        },
        open() {
            setUIState({ ...uiState, minimized: false, closed: false });
        },
        /**
         * 切页但不动开合状态（面板里那个循环按钮用）。
         * 非法值一律忽略 —— 这个入口会被菜单行与脏 localStorage 碰到，静默归一比抛错合适。
         */
        setView(view) {
            if (!PANEL_VIEWS.includes(view))
                return;
            if (uiState.view === view)
                return;
            setUIState({ ...uiState, view });
        },
        /**
         * 打开面板并切到指定页 —— `/` 菜单那三行的**全部**动作。
         *
         * 纯客户端：不再绕 `remote.commands.execute('/tasks insight list …')` 一圈。那条路
         * 只在对话里留下一个命令节点，而客户端渲染命令节点的是按**命令名**分发的
         * `TaskCommandNode`（`name === 'tasks'`），它拿任务解析器去解记忆载荷，解析必然失败
         * —— 于是点菜单"开记忆页"什么都不会发生。
         * @param view - 目标视图页；非法值直接忽略（不打开面板，避免"点了没反应还弹窗"）。
         */
        openView(view) {
            if (!PANEL_VIEWS.includes(view))
                return;
            setUIState({ ...uiState, view, minimized: false, closed: false });
        },
        minimize() {
            setUIState({ ...uiState, minimized: true, closed: false });
        },
        close() {
            setUIState({ ...uiState, minimized: true, closed: true });
        },
        setTheme(theme) {
            setUIState({ ...uiState, theme });
        },
        toggleHints() {
            setUIState({ ...uiState, showHints: !uiState.showHints });
        },
        setShowHints(showHints) {
            setUIState({ ...uiState, showHints });
        },
        reset() {
            setUIState(getDefaultUIState());
        },
    },
};
function useTaskUI() {
    return useSyncExternalStore(taskUIStore.subscribe, taskUIStore.getSnapshot, taskUIStore.getSnapshot);
}
function useTaskUIActions() {
    return taskUIStore.actions;
}
    __exports.normalizeView = normalizeView;
    __exports.useTaskUI = useTaskUI;
    __exports.useTaskUIActions = useTaskUIActions;
    __exports.PANEL_VIEWS = PANEL_VIEWS;
    __exports.taskUIStore = taskUIStore;
    };
}

    const __require = (from, spec) => {
      if (spec === 'react') return React;
      if (spec === 'react/jsx-runtime') return React;
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
      const id = __resolve(from, spec);
      if (__cache[id]) return __cache[id].exports;
      const factory = __modules[id];
      if (!factory) throw new Error('[dsh-turn-cost/memory] module not found: ' + id);
      const module = { exports: {} };
      __cache[id] = module;
      factory(module.exports, (s) => __require(id, s));
      return module.exports;
    };

    __registerMemoryModules(__modules);

    return __require('client-memory-src/client.js', './client.js');
  },
});
