/**
 * Task Panel — dsh web `shell.overlay` 浮动任务面板。
 * Container 组件：负责数据获取、命令桥接、状态协调
 * Presentational 组件在 TaskComponents.js
 *
 * 由 .tsx 手写改写为 createElement（原 444 行 / 59 处 JSX）。
 */
import { Component, createElement as h, useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconFolderOpenOutline16,
  IconQuestionOutline14,
} from './icons.js'
import { translatorFor } from './i18n.js'
import { invokeCommand } from './commands.js'
import { missingServices, service } from './services.js'
import { useTaskData, useTaskDataActions, parseTaskPayloadText } from './task-data-store.js'
import { useTaskUI, useTaskUIActions, PANEL_VIEWS } from './task-ui-store.js'
import { MiniBar, TaskCard } from './TaskComponents.js'
import { MemoryView } from './MemoryView.js'
import { invalidateInsightCache } from './memory-load.js'
import { pickSessionId } from './session-id.js'
import { css } from './styles.js'

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

export function TaskPanelEntry({ ctx }) {
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
