/**
 * Task Panel Presentational 组件 — MiniBar（折叠迷你条）与 TaskCard（任务卡）。
 * 纯渲染 + 卡片局部行内编辑/拖拽状态，动作经 props 回调交给容器（TaskPanel.js）。
 *
 * 由 .tsx 手写改写为 createElement（原 496 行 / 96 处 JSX）。
 * CSS 复用原 hashed 类名映射（styles.js），视觉与原包一致。
 */
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  IconCheckOutline16,
  IconPlayOutline16,
  IconFolderOpenOutline16,
} from './icons.js'
import { insightKindLabel } from './kind-label.js'
import { useTaskDrag } from './task-hooks.js'
import { timeAgo } from './relative-time.js'
import { css } from './styles.js'

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
export function MiniBar({ label, hint, showHints, position, theme, onMove, open }) {
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
export function TaskCard({
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
