/**
 * 「设置 → 记忆与笔记」页。
 *
 * 座位是 `settings.section`（id = `project-memory`，nav 图标走同 id 的
 * `settings.section.icon`），和费用偏好（`turn-cost`）、模型目录（`tc-models`）
 * 并列在宿主的设置面板里 —— 配置项属于设置，插件页只留一句说明。
 *
 * 数据面**完全走宿主设置**，不自建第二份配置：
 *   Config 里标了 `.volatile()` 的字段 → 宿主 settings 文档的一个命名空间（ns = 条目 id）
 *   → 客户端 `ctx.configForms.get(...)` 读写 → 宿主校验 + revision fence + volatile 原地更新。
 *   这里既不写 profile 的 yml，也不缓存值：这一页永远是宿主那份配置的投影。
 *
 * 三块内容，一条主线：「这个项目记住了什么 → 它能长多大 → 笔记检索在哪」
 *   1. **记忆清单**（只读）：`/tasks insight list <scope>` 的可视化，带容量占用。用户的原话是
 *      「只写了有项目记忆，但看不到有哪些记忆」—— 页面上不给清单，等于要求他先知道
 *      `save_lesson` 和任务面板的记忆视图在哪儿。每条可展开：全文、涉及的文件与符号、
 *      触发条件、条目 id 都在展开态里，不必为了看一个路径去翻数据文件。
 *   2. **记忆规模**（可写）：界面上只有**单轮注入预算**一行（`MEMORY_SCALE_VISIBLE_FIELDS`）；
 *      其余规模字段仍在表单里被读写，只是不占版面。写入走 `nested-form.js` 的数组 path。
 *   3. **笔记检索**（可写）：目录 / 开关 / 超时（`notes.*`）。
 * 记忆规模与笔记检索共用页面底部那一个保存按钮（`saveAll()` 依次落两份草稿）。
 */
import {
  Button, SettingsFormModel, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { service } from './services.js'
import { NOTES_FIELDS, NotesSettingsForm } from './notes-settings.js'
import {
  MEMORY_ENUM_FIELDS, MEMORY_SCALE_ALL_FIELDS, MEMORY_SCALE_FIELDS,
  MEMORY_SCALE_VISIBLE_FIELDS, MEMORY_SCALE_WIDGET, MemoryScaleForm, TOPIC_GATE_VALUES,
} from './memory-settings.js'
import {
  INVENTORY_PAGE_SIZE, MEMORY_SCOPES, emptyInventory, injectSummary, inventoryRows, scopeCapacityField,
  summarizeInventory, usagePercent,
} from './memory-inventory.js'
import { parseInsightPayloadText, parsePayloadText, readInsightCache, writeInsightCache } from './memory-load.js'
import { insightKindLabel } from './kind-label.js'
import { insightEstimateLine, insightListLine } from './paging.js'
import { invokeCommand } from './commands.js'
import { pickSessionId } from './session-id.js'
import { projectModel, projectOptionLabel, samePath, shortPath } from './project-options.js'
import { NotesDirectoryDialog } from './NotesDirectoryDialog.js'
import { directoryAccess } from './notes-directory.js'
import { createTranslate, en, zh } from './locales.js'
import { settingsCss as css } from './styles.js'

/** 本 bundle 在 profile 的 loader 条目 id（cordis.patch.yml 定死的那个），也是 settings 命名空间。 */
export const SETTINGS_ENTRY_ID = 'dsh-session-insight'
/** 设置面板里的分区 id；图标注册必须用同一个 id 才会被渲染。 */
export const SETTINGS_SECTION_ID = 'project-memory'
/** 分区在设置导航里的位置（费用 30 / 模型目录 31 之后）。 */
export const SETTINGS_SECTION_ORDER = 32
/** 本页文案的 locale 命名空间。与面板共用一份词典，但独立注册，互不影响。 */
export const SETTINGS_NS = 'dsh-project-memory.settings'

/**
 * 收起态下正文的截断长度。
 *
 * 收起态负责"认出这条是什么"：一条 experience 的 solution 可以上千字，整段平铺会把下面
 * 所有控件推出屏幕。全文与文件、触发条件都在展开态里（`inventoryDetail`），详情块自带
 * 滚动，所以这里只需要一个够认人的长度。
 */
const INVENTORY_BODY_CHARS = 140

/**
 * 桥接 settings 命名空间到本页状态。
 *
 * `SettingsFormModel` 仍然只用来提供 SnapshotStore 与 scope 订阅（`bind()` 是宿主唯一现成的
 * 那个实现），字段表**故意空着**：本页没有任何顶层键可编辑，可写的都是 Config 子对象
 * （`notes.*` / `insight.*` / `autoContext.*`，见 nested-form.js 的头注释）。
 */
export class SettingsSectionController {
  /**
   * @param scope - 本条目在 `configForms` 里的 scope（读写宿主设置）。
   * @param directory - 目录浏览通道（`uiWorkspace.listDirectory` 的软包装）；
   *   宿主没有这项能力时传 `null`，设置页回退成手写输入框。
   * @param ctx - client 根上下文。记忆清单要靠它读 `sessions` 服务与命令通道；
   *   宿主装配里没有它时清单显示"没有活跃会话"，其余照常。
   */
  constructor(scope, directory = null, ctx = null) {
    this.form = new SettingsFormModel(scope, [])
    this.notes = new NotesSettingsForm(scope)
    this.scale = new MemoryScaleForm(scope)
    this.directory = directory
    this.ctx = ctx
    this.store = this.form.bind(() => this.projection())
    this.unsubscribeNotes = this.notes.subscribe(() => { this.store.set(this.projection()) })
    this.unsubscribeScale = this.scale.subscribe(() => { this.store.set(this.projection()) })
  }

  /** 构造槽位注入面。 */
  inject() {
    return {
      hooks: { settingsCard: this.store },
      directory: this.directory,
      ctx: this.ctx,
      ...this.notes.actions(),
      ...this.scale.actions(),
      save: () => { void this.saveAll() },
      discard: () => {
        this.form.actions().discard()
        this.notes.discard()
        this.scale.discard()
      },
    }
  }

  /** 一次保存点同时落两份草稿；任何一份失败就停在那里（不吞掉另一份的草稿）。 */
  async saveAll() {
    await this.form.save()
    if (this.form.shell().failed) return
    await this.scale.save()
    if (this.scale.shell().failed) return
    await this.notes.save()
  }

  /** 释放对宿主命名空间的订阅。 */
  dispose() {
    this.unsubscribeNotes?.()
    this.unsubscribeScale?.()
    this.notes.dispose()
    this.scale.dispose()
    this.form.dispose()
  }

  projection() {
    const notesFields = {}
    for (const field of NOTES_FIELDS) notesFields[field] = this.notes.field(field)
    const scaleFields = {}
    // `effective` 是**生效值**（不是草稿）：记忆清单的容量占用必须跟着已保存的容量走，
    // 否则用户一边改容量、一边看进度条跳动，永远不知道哪个数字才算数。
    // 枚举字段（topicGate）同样投影生效值——它是字符串，别拿数值判据把它筛掉。
    const scaleEffective = {}
    for (const field of MEMORY_SCALE_ALL_FIELDS) {
      scaleFields[field] = this.scale.field(field)
      const value = this.scale.sectionValue(field)
      scaleEffective[field] = typeof value === 'number' && Number.isFinite(value)
        ? value
        : typeof value === 'string' && value ? value : null
    }
    const base = this.form.shell()
    const notes = this.notes.shell()
    const scale = this.scale.shell()
    return {
      available: base.available,
      writable: base.writable && (!notes.available || notes.writable) && (!scale.available || scale.writable),
      dirty: base.dirty || notes.dirty || scale.dirty,
      invalid: base.invalid || notes.invalid || scale.invalid,
      saving: base.saving || notes.saving || scale.saving,
      failed: base.failed || notes.failed || scale.failed,
      notes: { ...notes, fields: notesFields },
      scale: { ...scale, fields: scaleFields, effective: scaleEffective },
    }
  }
}

/** 一行：左侧标题 + 说明，右侧控件。 */
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

/** 渲染器缺钩子时的占位状态：本页只显示说明，不读任何宿主值。 */
const UNAVAILABLE_STATE = {
  available: false,
  writable: false,
  dirty: false,
  invalid: false,
  saving: false,
  failed: false,
  notes: {
    available: false,
    writable: false,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    fields: Object.fromEntries(
      NOTES_FIELDS.map((field) => [field, { text: '', overridden: false, invalid: false }]),
    ),
  },
  scale: {
    available: false,
    writable: false,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    effective: {},
    fields: Object.fromEntries(
      MEMORY_SCALE_FIELDS.map((field) => [field, { text: '', overridden: false, invalid: false }]),
    ),
  },
}

/** 非 Hook 的稳定回退：hook 数量在两次渲染之间不变，避免条件调用 Hooks。 */
const fallbackHook = (selector) => selector(UNAVAILABLE_STATE)

/**
 * 当前会话 id（与任务面板同一份解析，见 session-id.js）。
 *
 * 设置页没有会话属性可拿，只能从 `sessions.list` 快照里挑"用户正在看的那个"。这条订阅是
 * 必需的：切换对话后 `retainedBy.mainView` 变化会重新发布快照，清单才会跟着换项目。
 */
function useSessionId(ctx) {
  const [, force] = useState(0)
  useEffect(() => {
    const list = ctx === null || ctx === undefined ? undefined : service(ctx, 'sessions')?.list
    if (!list || typeof list.subscribe !== 'function') return undefined
    return list.subscribe(() => force((n) => n + 1))
  }, [ctx])
  if (ctx === null || ctx === undefined) return null
  return pickSessionId(service(ctx, 'sessions')?.list?.getSnapshot?.())
}

/**
 * 宿主的工作区注册表快照（`ctx.workspaces.list`）。
 *
 * 「看哪个项目」下拉框的选项就是这份清单 —— 左侧栏里那几条项目与它是同一份数据，
 * 所以在侧栏新增/改名/删除工作区时，设置页的下拉框会自动跟上，不需要刷新页面。
 * 服务缺失（老宿主）时返回 undefined，由 `projectModel` 退化成会话 cwd 列表。
 * @param {object|null} ctx - client 上下文（设置页拿不到时为 null）
 * @returns {object|undefined} `ctx.workspaces.list.getSnapshot()`
 */
function useWorkspacesSnapshot(ctx) {
  const [, force] = useState(0)
  useEffect(() => {
    const list = ctx === null || ctx === undefined ? undefined : service(ctx, 'workspaces')?.list
    if (!list || typeof list.subscribe !== 'function') return undefined
    return list.subscribe(() => force((n) => n + 1))
  }, [ctx])
  if (ctx === null || ctx === undefined) return undefined
  return service(ctx, 'workspaces')?.list?.getSnapshot?.()
}

/** ISO 时间 → 本地短日期；坏时间留空（不显示 NaN）。 */function shortDate(iso) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return ''
  try {
    return new Date(t).toLocaleDateString()
  } catch {
    return ''
  }
}

/**
 * 详情块里按 kind 展示的正文型字段（与摘要重复的会被跳过）。
 *
 * 顺序固定为「问题 → 选择 → 理由 → 修法 → 解决 → 模式」：它同时是一条记忆从
 * 现象到结论的读法，而不是字段在 JSON 里的存储顺序。
 */
const DETAIL_FIELDS = [
  ['problem', 'settings.memory.field.problem'],
  ['choice', 'settings.memory.field.choice'],
  ['reason', 'settings.memory.field.reason'],
  ['fix', 'settings.memory.field.fix'],
  ['solution', 'settings.memory.field.solution'],
  ['pattern', 'settings.memory.field.pattern'],
]

/** 详情里的一个小节：标题 + 内容（可多个子节点）。 */
function detailBlock(key, label, ...children) {
  return h('div', { key, className: css.invBlock },
    h('div', { className: css.invBlockLabel }, label),
    ...children)
}

/** 「标签：值 值 值」一行；值为空时空行不画。 */
function triggerLine(key, label, values) {
  const list = Array.isArray(values) ? values : []
  if (list.length === 0) return null
  return h('div', { key, className: css.invTriggerRow },
    h('span', { className: css.invTriggerLabel }, label),
    h('span', { className: css.invTriggerValue }, list.join(' · ')))
}

/** 触发条件的各组取值（老字段 keywords/scope 与 when 并列，谁空谁不画）。 */
function triggerLines(trigger, t) {
  const when = trigger.when === null || trigger.when === undefined ? {} : trigger.when
  const lines = [
    triggerLine('writes', t('settings.memory.trigger.writes'), when.writes),
    triggerLine('ops', t('settings.memory.trigger.ops'), when.ops),
    triggerLine('intents', t('settings.memory.trigger.intents'), when.intents),
    triggerLine('paths', t('settings.memory.trigger.paths'), when.paths),
    triggerLine('hosts', t('settings.memory.trigger.hosts'), when.hosts),
  ]
  const guard = when.guard
  if (guard && typeof guard === 'object') {
    // `guard` 的三个面合成一行：前缀 `!` 表示排除、`#` 表示标签，裸值表示"必须落在这些路径里"。
    lines.push(triggerLine('guard', t('settings.memory.trigger.guard'), [
      ...(Array.isArray(guard.paths) ? guard.paths : []),
      ...(Array.isArray(guard.notPaths) ? guard.notPaths.map((item) => `!${item}`) : []),
      ...(Array.isArray(guard.tags) ? guard.tags.map((item) => `#${item}`) : []),
    ]))
  }
  lines.push(triggerLine('keywords', t('settings.memory.trigger.keywords'), trigger.keywords))
  lines.push(triggerLine('scope', t('settings.memory.trigger.scope'), trigger.scope))
  return lines.filter(Boolean)
}

/**
 * 展开态的详情。
 *
 * 全部字段都来自同一次列表载荷（`fileList` / `symbolList` / `trigger` / `steps` /
 * 各 kind 正文），这里不发第二条命令、也不读第二份数据：一页拿到什么就显示什么。
 * 唯一需要额外说明的是清单被宿主截断（`files > fileList.length`）——那行提示必须写，
 * 否则「文件 23」下面只列出 40 个里的 23 个会让人以为列表漏了。
 */
export function inventoryDetail(row, t) {
  const blocks = []
  // procedure 的 `body` 是宿主合成的「步骤 N 条：第一条…」摘要，展开后列真步骤更有用。
  const stepsInline = row.kind === 'procedure' && row.steps.length > 0
  if (row.body !== '' && !(stepsInline && row.body.startsWith('步骤'))) {
    blocks.push(detailBlock('body', t('settings.memory.detail.body'),
      h('p', { className: css.invBodyFull }, row.body)))
  }
  if (row.steps.length > 0) {
    blocks.push(detailBlock('steps', t('settings.memory.detail.steps', { count: String(row.steps.length) }),
      h('ol', { className: css.invSteps },
        ...row.steps.map((step, index) => h('li', { key: String(index), className: css.invStep }, step)))))
  }
  for (const [field, labelKey] of DETAIL_FIELDS) {
    const value = row[field]
    if (value === null || value === undefined || value === row.body) continue
    blocks.push(detailBlock(field, t(labelKey), h('p', { className: css.invBodyFull }, value)))
  }
  if (row.fileList.length > 0) {
    const total = Math.max(row.files, row.fileList.length)
    blocks.push(detailBlock('files', t('settings.memory.detail.files', { count: String(total) }),
      h('div', { className: css.invChips },
        ...row.fileList.map((file, index) => h('code', { key: `${file}#${index}`, className: css.invFile }, file))),
      total > row.fileList.length
        ? h('p', { className: css.invOverflow }, t('settings.memory.detail.more', {
          shown: String(row.fileList.length), total: String(total),
        }))
        : null))
  }
  if (row.symbolList.length > 0) {
    const total = Math.max(row.symbols, row.symbolList.length)
    blocks.push(detailBlock('symbols', t('settings.memory.detail.symbols', { count: String(total) }),
      h('div', { className: css.invChips },
        ...row.symbolList.map((symbol, index) => h('code', { key: `${symbol}#${index}`, className: css.invSymbol }, symbol))),
      total > row.symbolList.length
        ? h('p', { className: css.invOverflow }, t('settings.memory.detail.more', {
          shown: String(row.symbolList.length), total: String(total),
        }))
        : null))
  }
  if (row.trigger !== null) {
    const lines = triggerLines(row.trigger, t)
    if (lines.length > 0) blocks.push(detailBlock('trigger', t('settings.memory.detail.trigger'), ...lines))
  }
  blocks.push(h('p', { key: 'id', className: css.invId }, t('settings.memory.detail.id', { id: row.id })))
  return h('div', { className: css.invDetail }, ...blocks)
}

/**
 * 一条记忆在清单里的样子（kind 徽章 + 标题 + 摘要 + 元信息），点标题行展开详情。
 *
 * 展开不是锦上添花：摘要按 140 字截断，涉及的文件、符号、触发条件根本不在摘要里，
 * 而设置页是用户唯一能"看"记忆库的地方 —— 只能看摘要等于看不到记忆。
 * 一起进详情的是条目 id：要回到任务面板做确认/提升/归档时，靠它认人。
 */
export function InventoryRow(props) {
  const { row, t } = props
  const [open, setOpen] = useState(false)
  const meta = []
  if (row.draft) meta.push(h('span', { key: 'draft', className: css.invBadgeDraft + ' ' + css.invBadge }, t('settings.memory.badge.draft')))
  if (row.archived) meta.push(h('span', { key: 'archived', className: css.invBadge }, t('settings.memory.badge.archived')))
  if (row.confidence !== null) meta.push(h('span', { key: 'conf' }, t('settings.memory.meta.confidence', { value: row.confidence.toFixed(2) })))
  if (row.hitCount > 0) meta.push(h('span', { key: 'hits' }, t('settings.memory.meta.hits', { count: String(row.hitCount) })))
  // 计数徽标放在收起态：不展开也能看出"这条牵着几个文件"，展开才知道是哪些。
  if (row.files > 0) meta.push(h('span', { key: 'files' }, t('settings.memory.meta.files', { count: String(row.files) })))
  if (row.symbols > 0) meta.push(h('span', { key: 'symbols' }, t('settings.memory.meta.symbols', { count: String(row.symbols) })))
  if (row.members > 0) meta.push(h('span', { key: 'members' }, t('settings.memory.meta.members', { count: String(row.members) })))
  if (row.taskTitle !== null) meta.push(h('span', { key: 'task' }, row.taskTitle))
  const when = shortDate(row.updatedAt)
  if (when !== '') meta.push(h('span', { key: 'when' }, when))
  const rowClass = row.archived ? css.invRow + ' ' + css.invRowArchived : css.invRow
  return h('div', {
    className: open ? rowClass + ' ' + css.invRowOpen : rowClass,
    'data-insight-id': row.id,
    'data-open': open ? 'true' : 'false',
  },
  h('button', {
    type: 'button',
    className: css.invHead + ' ' + css.invHeadBtn,
    'aria-expanded': open ? 'true' : 'false',
    title: t(open ? 'settings.memory.collapse' : 'settings.memory.expand'),
    onClick: () => { setOpen((prev) => !prev) },
  },
  h('span', {
    key: 'chevron',
    className: open ? css.invChevron + ' ' + css.invChevronOpen : css.invChevron,
    'aria-hidden': 'true',
  }, '▸'),
  h('span', { key: 'kind', className: css.kind, 'data-kind': row.kind }, insightKindLabel(row.kind, t)),
  h('span', { key: 'title', className: css.invTitle }, row.title === '' ? t('settings.memory.untitled') : row.title)),
  row.body === '' || open
    ? null
    : h('p', { className: css.invBody }, row.body.length > INVENTORY_BODY_CHARS
      ? row.body.slice(0, INVENTORY_BODY_CHARS) + '…'
      : row.body),
  meta.length === 0 ? null : h('div', { className: css.invMeta }, ...meta),
  open ? inventoryDetail(row, t) : null)
}

/** 「看哪个项目」的选择持久化键：按浏览器记，不写回 profile（它只是视图，不是配置）。 */
const PROJECT_OVERRIDE_KEY = 'dshpm.inventory.root'

function readProjectOverride() {
  try {
    const v = window.localStorage.getItem(PROJECT_OVERRIDE_KEY)
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

function writeProjectOverride(root) {
  try {
    if (root) window.localStorage.setItem(PROJECT_OVERRIDE_KEY, root)
    else window.localStorage.removeItem(PROJECT_OVERRIDE_KEY)
  } catch {
    /* 隐私模式/禁用存储：切项目仍生效，只是下次打开不记得 */
  }
}

/** 路径太长时从中间省略的实现搬到了 `project-options.js`（那里要拿它拼选项文本）。 */

/** 记忆清单（只读）。数据通道与任务面板的记忆视图完全相同。 */
function InventoryPanel(props) {
  const { ctx, t, scale } = props
  const sessionId = useSessionId(ctx)
  const [scope, setScope] = useState(MEMORY_SCOPES[0])
  const [state, setState] = useState(() => emptyInventory())
  const [refreshTick, setRefreshTick] = useState(0)
  // 「手动刷新」只绕过一次缓存：消费掉这一跳之后，切页签仍然走 30 秒缓存。
  const consumedRefresh = useRef(0)
  // 看哪个项目：null = 当前会话项目；非 null = 用户在本地选的另一个项目根（只读）。
  const [projectRoot, setProjectRoot] = useState(readProjectOverride)
  // 注入量估算：宿主用真引擎跑出来的三个数（上限 / 本步 / 池子）。
  const [inject, setInject] = useState(null)
  // 宿主忽略了 `root=` 时的标记（见下面取数的注释）：跨项目读取还没生效，界面必须说出来。
  const [viewStale, setViewStale] = useState(false)
  // 工作区注册表：下拉框的选项来源。订阅它，侧栏新增/改名工作区时这一页自动跟上。
  const workspaces = useWorkspacesSnapshot(ctx)
  // 下拉框的行模型（选项 / 当前会话项目 / 当前选中项）。会话 cwd 变化时重算 ——
  // `useSessionId` 已经订阅了会话列表，切对话会重渲染。
  const projects = projectModel({
    workspaces,
    sessions: ctx === null || ctx === undefined ? undefined : service(ctx, 'sessions')?.list?.getSnapshot?.(),
    sessionId,
    override: projectRoot,
  })

  useEffect(() => {
    let alive = true
    if (!sessionId) {
      // 没有活跃会话时不发命令、也不报错：宿主命令必须挂在某个会话上执行，
      // 报"读取失败"会让人以为记忆库坏了。
      setState({ ...emptyInventory(), scope, loaded: false })
      setInject(null)
      return () => { alive = false }
    }
    // 命中 30 秒缓存就不再发命令：`remote.commands.execute` 会在**会话历史里**留一条 command
    // 节点（任务面板的记忆视图同样受这条约束），来回切页签不该在对话里堆一串命令卡片。
    // 手动「刷新」用 refreshTick 显式绕过缓存。
    const forced = consumedRefresh.current !== refreshTick
    if (forced) consumedRefresh.current = refreshTick
    const cached = forced ? null : readInsightCache(sessionId, scope, projectRoot, null)
    if (cached !== null) {
      // 缓存命中不经解析，就没有新的回执可判：跟随会话时直接清掉上一轮的"宿主没生效"提示。
      if (projectRoot === null || projectRoot === undefined) setViewStale(false)
      setState({
        scope,
        rows: cached.rows,
        total: cached.total,
        nextOffset: cached.nextOffset,
        loading: false,
        error: null,
        loaded: true,
      })
      return () => { alive = false }
    }
    setState((prev) => ({ ...prev, scope, loading: true, error: null }))
    void (async () => {
      const result = await invokeCommand(ctx, sessionId, insightListLine(scope, 0, INVENTORY_PAGE_SIZE, projectRoot))
      if (!alive) return
      if (!result.ok) {
        setState({ ...emptyInventory(), scope, error: result.error || 'command failed', loaded: true })
        return
      }
      const parsed = parseInsightPayloadText(result.text)
      if (!parsed) {
        setState({ ...emptyInventory(), scope, error: t('settings.memory.unparsable'), loaded: true })
        return
      }
      const rows = inventoryRows(parsed.items)
      // 宿主有没有真的读到我们请求的项目：老宿主（`root=` 支持落地前启动的进程）会**忽略**这个参数，
      // 悄悄返回会话自己的项目。载荷里的 `root` 是回执，对不上就在行上说明 —— 否则"正在看 note"
      // 是假的，而界面上看不出任何区别。
      setViewStale(
        projectRoot !== null && projectRoot !== undefined
        && !(typeof parsed.root === 'string' && samePath(parsed.root, projectRoot)),
      )
      // 缓存 key 带上当前查看的项目根：同一个会话切到别的项目时必须重新取，不能复用上一个项目的列表。
      writeInsightCache(sessionId, scope, projectRoot, null, rows, parsed.total, parsed.nextOffset)
      setState({
        scope,
        rows,
        total: parsed.total,
        nextOffset: parsed.nextOffset,
        loading: false,
        error: null,
        loaded: true,
      })
    })()
    return () => { alive = false }
    // `t` 刻意不进依赖：语言切换不该触发一次命令；文案只在状态变化时读取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, sessionId, scope, refreshTick, projectRoot])

  // 注入量估算：独立于清单，失败只在那一行说一句，不影响清单本身的可用性。
  useEffect(() => {
    let alive = true
    if (!sessionId) {
      setInject(null)
      return () => { alive = false }
    }
    void (async () => {
      const result = await invokeCommand(ctx, sessionId, insightEstimateLine(projectRoot))
      if (!alive) return
      if (!result.ok) {
        setInject({ error: result.error || 'command failed' })
        return
      }
      const payload = parsePayloadText(result.text)
      const summary = injectSummary(payload)
      setInject(summary === null ? { error: t('settings.memory.inject.unparsable') } : summary)
    })()
    return () => { alive = false }
    // `t` 同样不进依赖：文案只在状态变化时取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, sessionId, projectRoot, refreshTick])

  /**
   * 选定「看哪个项目」。
   *
   * 选中项就是当前会话项目时**清掉本地覆盖**（回到"跟随会话"）：这样切对话后下拉框会跟着
   * 会话走，而不是钉在某个路径上。选了别的项目才写覆盖 —— 那是一个只读视图。
   * @param {string} next - 选中的项目根（空串 = 没有可选项目）
   */
  const chooseProjectPath = useCallback((next) => {
    const path = typeof next === 'string' ? next : ''
    const followCurrent = path === '' || (projects.currentPath !== null && samePath(path, projects.currentPath))
    setProjectRoot(followCurrent ? null : path)
    writeProjectOverride(followCurrent ? null : path)
  }, [projects.currentPath])

  /** 选择「看哪个项目」：只认宿主工作区注册表里的项目，下拉框就是入口。 */
  const capacityField = scopeCapacityField(scope)
  const capacity = capacityField === null ? null : scale?.effective?.[capacityField] ?? null
  const stats = summarizeInventory({ items: state.rows, total: state.total, capacity })
  const percent = usagePercent(stats.ratio)

  const usageText = capacity === null
    ? t('settings.memory.usage.nocap', { used: String(stats.used) })
    : t('settings.memory.usage', { used: String(stats.used), capacity: String(capacity), percent: String(percent ?? 0) })

  const tabs = h('div', { className: css.tabs, role: 'tablist' },
    ...MEMORY_SCOPES.map((name) => h('button', {
      key: name,
      type: 'button',
      role: 'tab',
      'aria-selected': name === scope ? 'true' : 'false',
      className: name === scope ? css.tab + ' ' + css.tabActive : css.tab,
      onClick: () => { setScope(name) },
    }, t(`settings.memory.scope.${name}`))))

  let body
  if (!sessionId) {
    body = h('p', { className: css.invEmpty }, t('settings.memory.noSession'))
  } else if (state.error !== null) {
    body = h('p', { className: css.failed }, t('settings.memory.failed', { message: state.error }))
  } else if (state.loading && state.rows.length === 0) {
    body = h('p', { className: css.invEmpty }, t('settings.memory.loading'))
  } else if (state.loaded && state.rows.length === 0) {
    body = h('p', { className: css.invEmpty }, t('settings.memory.empty'))
  } else {
    body = h('div', { className: css.invList },
      ...state.rows.map((row) => h(InventoryRow, { key: row.id, row, t })))
  }

  const truncated = state.nextOffset !== null && state.nextOffset !== undefined

  // 看哪个项目：下拉框的选项就是宿主那份工作区列表（左侧栏同款），默认选中当前会话所在的项目；
  // 选了别的项目只是**只读**视图 —— 写入永远走会话自己的项目。
  const projectOptionNodes = projects.options.map((option) => h('option', {
    key: option.path,
    value: option.path,
    // 选项只显示项目名，全路径挂在 title 上：hover 就能核对到底是哪个目录。
    title: option.path,
  }, projectOptionLabel(option) + (option.current ? ' ' + t('settings.memory.project.currentMark') : '')))
  if (projectOptionNodes.length === 0) {
    projectOptionNodes.push(h('option', { key: 'no-project', value: '' }, t('settings.memory.project.empty')))
  }
  const projectRow = h('div', { className: css.projectRow },
    h('span', { className: css.projectLabel }, t('settings.memory.project.label')),
    h('select', {
      className: css.projectSelect,
      'aria-label': t('settings.memory.project.label'),
      title: projects.selected === '' ? t('settings.memory.project.empty') : projects.selected,
      value: projects.selected,
      disabled: !sessionId || projects.options.length === 0,
      onChange: (event) => { chooseProjectPath(event.target.value) },
    }, ...projectOptionNodes),
    projects.foreign
      ? h('span', { className: css.notice }, t('settings.memory.project.foreign', { path: shortPath(projects.selected) }))
      : null,
    viewStale
      ? h('span', { className: css.notice, role: 'status' }, t('settings.memory.project.stale'))
      : null)

  // 注入量：宿主真引擎算出来的三个数。没有会话就不显示（读不到项目根）。
  let injectRow = null
  if (sessionId && inject) {
    if (inject.error) injectRow = h('p', { className: css.notice }, t('settings.memory.inject.failed', { message: inject.error }))
    else {
      injectRow = h('p', { className: css.usage, 'data-kind': 'inject' },
        h('span', null, t('settings.memory.inject.line', {
          chars: String(inject.chars),
          tokens: String(inject.estTokens),
          limit: String(inject.limitChars),
          percent: String(inject.percent ?? 0),
          pool: String(inject.poolChars),
          count: String(inject.poolItems),
        })),
        h('span', { className: css.usageBar },
          h('span', {
            className: css.usageFill,
            style: { width: `${inject.percent ?? 0}%` },
          })))
    }
  }

  return h('div', null,
    h('h4', { className: css.group }, t('settings.memory.section')),
    h('p', { className: css.hint }, t('settings.memory.hint')),
    projectRow,
    injectRow,
    h('div', { className: css.toolbar },
      tabs,
      h('button', {
        type: 'button',
        className: css.dialogBtn,
        disabled: !sessionId || state.loading,
        onClick: () => { setRefreshTick((n) => n + 1) },
      }, state.loading ? t('settings.memory.loadingShort') : t('settings.memory.refresh'))),
    h('p', { className: css.usage, 'data-scope': scope },
      h('span', null, usageText),
      capacity === null
        ? null
        : h('span', { className: css.usageBar },
          h('span', {
            className: css.usageFill,
            'data-warn': stats.ratio !== null && stats.ratio >= 0.9 ? 'true' : undefined,
            style: { width: `${percent ?? 0}%` },
          }))),
    body,
    truncated
      ? h('p', { className: css.invEmpty }, t('settings.memory.truncated', {
        shown: String(stats.shown), total: String(stats.used),
      }))
      : null)
}

/**
 * 记忆规模：**只画一行** —— 单轮注入预算。
 *
 * 其余规模字段（两层容量、常驻条数、两个保险丝、主题门控）仍在表单里被读写，只是不上界面：
 * 判断标准见 `MEMORY_SCALE_VISIBLE_FIELDS` 的头注释。表单一格不改的直接后果是这一页只剩
 * 一个数字框，保存、脏判定、范围校验仍然走同一套 nested-form 管线。
 */
function ScaleRows(props) {
  const { t, scale, disabled, editScale } = props
  const rows = []
  for (const field of MEMORY_SCALE_VISIBLE_FIELDS) {
    // 区间与单位取**显示单位**那张表：预算在界面上是字符（= 引擎硬上限），配置里是 token。
    // 保存校验仍走 `MEMORY_SCALE_LIMITS`，两处差一个 `BUDGET_CHARS_PER_TOKEN`。
    const widget = MEMORY_SCALE_WIDGET[field]
    const unitKey = widget.unit === 'chars'
      ? 'settings.memory.unit.chars'
      : widget.unit === 'items'
        ? 'settings.memory.unit.items'
        : 'settings.memory.unit.tokens'
    rows.push(h(SettingRow, {
      key: field,
      title: t(`settings.memory.scale.${field}.title`),
      hint: t(`settings.memory.scale.${field}.hint`),
    },
    h('input', {
      className: css.number,
      type: 'number',
      min: widget.min,
      max: widget.max,
      step: widget.step,
      inputMode: 'numeric',
      'aria-label': t(`settings.memory.scale.${field}.title`),
      value: scale.fields[field]?.text ?? '',
      disabled,
      'aria-invalid': scale.fields[field]?.invalid || undefined,
      onChange: (event) => { editScale(field, event.target.value) },
    }),
    h('span', { className: css.unit }, t(unitKey))))
  }
  // 枚举字段同样按可见表过滤：当前没有可见的枚举（主题门控已从界面撤下），过滤是唯一的
  // 筛选点 —— 将来把哪一格放回界面，只改 MEMORY_SCALE_VISIBLE_FIELDS，这里不用动。
  for (const field of MEMORY_ENUM_FIELDS.filter((name) => MEMORY_SCALE_VISIBLE_FIELDS.includes(name))) {
    const options = field === 'topicGate' ? TOPIC_GATE_VALUES : []
    rows.push(h(SettingRow, {
      key: field,
      title: t(`settings.memory.${field}.title`),
      hint: t(`settings.memory.${field}.note`),
    },
    h('select', {
      className: css.select,
      'aria-label': t(`settings.memory.${field}.title`),
      value: scale.fields[field]?.text ?? '',
      disabled,
      'aria-invalid': scale.fields[field]?.invalid || undefined,
      onChange: (event) => { editScale(field, event.target.value) },
    }, ...options.map((value) => h('option', { key: value, value }, t(`settings.memory.${field}.value.${value}`))))))
  }
  return h('div', null,
    h('h4', { className: css.group }, t('settings.memory.scale.section')),
    ...rows)
}

/** 渲染设置页。 */
export function MemorySettingsSection(props) {
  const t = props.t ?? createTranslate(zh)
  const useSettingsCard = props.useSettingsCard ?? fallbackHook
  const state = useSettingsCard((snapshot) => snapshot)
  const discard = props.discard
  // 离开这一页时丢掉未保存的草稿（与宿主设置表单的约定一致）。
  useEffect(() => () => { discard?.() }, [discard])
  const editNotes = props.editNotes
  const editScale = props.editScale
  const save = props.save
  const disabled = !state.writable || state.saving
  // 笔记那段的状态活在独立表单里（嵌套路径），缺宿主命名空间时回退到占位形状。
  const notes = state.notes ?? UNAVAILABLE_STATE.notes
  const scale = state.scale ?? UNAVAILABLE_STATE.scale
  const notesDisabled = disabled || !notes.available || !notes.writable
  const scaleDisabled = disabled || !scale.available || !scale.writable
  const notesOn = (field) => notes.fields[field]?.text === 'true'
  const editNote = (field, text) => { editNotes?.(field, text) }
  // 逐字段可选链：宿主给的 notes 快照可能只带部分键（命名空间存在但没暴露这些子字段），
  // 直接 `notes.fields.repo.text` 会在渲染期 TypeError，整页白屏。
  const notesPath = (notes.fields.repo?.text ?? '').trim()
  // 三种状态必须分开说：没配、配了但关掉、开着。只按"路径是否为空"判断会让关掉之后
  // 页面继续写「已启用」——那种自相矛盾的提示比不显示更糟。
  const notesStatus = !notes.available
    ? t('settings.notes.unavailable')
    : notesPath === ''
      ? t('settings.notes.status.off')
      : notesOn('enabled')
        ? t('settings.notes.status.on', { path: notesPath })
        : t('settings.notes.status.disabled', { path: notesPath })
  const saveBlocked = !state.dirty || state.invalid || state.saving || !state.writable

  // 目录默认让用户「点」，而不是「敲」：`notes.repo` 填错的三种形态（模型没有
  // search_notes、检索永远 degraded、选了缺 .notes/ 的上层目录）在面板里都看不出来。
  // `available()` 每次渲染重新探测 —— uiWorkspace 可能比本插件晚到位。
  const canPick = typeof props.directory?.available === 'function' && props.directory.available() === true
  const [manualInput, setManualInput] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [chooseError, setChooseError] = useState('')

  /**
   * 点「选择目录」：先问宿主装配了哪种选择器，再把用户送到对应的那个。
   *
   * `browse` → 内嵌目录浏览器（远端部署）；`native` → 操作系统自己的文件夹对话框
   * （本机桌面）。两条路的终点都是"用户点出来的绝对路径"，没有一条要用户敲字符。
   */
  const chooseDirectory = async () => {
    const api = props.directory
    if (!api || choosing) return
    setChooseError('')
    setChoosing(true)
    try {
      const mode = typeof api.mode === 'function' ? await api.mode() : 'browse'
      if (mode === 'browse') {
        setPickerOpen(true)
        return
      }
      if (mode === 'native') {
        const picked = await api.pick()
        if (typeof picked === 'string' && picked.trim() !== '') editNote('repo', picked.trim())
        return
      }
      setChooseError(t('settings.notes.picker.unavailable'))
    } catch (err) {
      // 宿主文案（zenity 失败、无显示环境、被中断）原样带上，前面加一句"这是选择器没打开"，
      // 否则用户看到一行英文命令行输出完全不知道跟自己点的按钮有什么关系。
      const message = err && err.message ? String(err.message) : String(err)
      setChooseError(t('settings.notes.picker.failed', { message }))
    } finally {
      setChoosing(false)
    }
  }
  const repoControl = canPick && !manualInput
    ? [
        h('span', {
          key: 'value',
          className: css.repoValue,
          'data-empty': notesPath === '' ? 'true' : undefined,
          title: notesPath,
        }, notesPath === '' ? t('settings.notes.repo.empty') : notesPath),
        h('button', {
          key: 'choose',
          type: 'button',
          className: css.dialogBtn,
          disabled: notesDisabled || choosing,
          onClick: () => { void chooseDirectory() },
        }, choosing ? t('settings.notes.repo.choosing') : t('settings.notes.repo.choose')),
        notesPath === ''
          ? null
          : h('button', {
            key: 'clear',
            type: 'button',
            className: css.linkBtn,
            disabled: notesDisabled,
            onClick: () => { editNote('repo', '') },
          }, t('settings.notes.repo.clear')),
        h('button', {
          key: 'manual',
          type: 'button',
          className: css.linkBtn,
          disabled: notesDisabled,
          onClick: () => { setManualInput(true) },
        }, t('settings.notes.repo.manual')),
      ]
    : [
        h('input', {
          key: 'input',
          className: css.text,
          type: 'text',
          spellCheck: false,
          autoComplete: 'off',
          placeholder: t('settings.notes.repo.placeholder'),
          'aria-label': t('settings.notes.repo.title'),
          value: notes.fields.repo?.text ?? '',
          disabled: notesDisabled,
          'aria-invalid': notes.fields.repo?.invalid || undefined,
          onChange: (event) => { editNote('repo', event.target.value) },
        }),
        canPick
          ? h('button', {
            key: 'picker',
            type: 'button',
            className: css.linkBtn,
            disabled: notesDisabled,
            onClick: () => { setManualInput(false) },
          }, t('settings.notes.repo.picker'))
          : null,
      ]

  const body = state.available
    ? h('div', null,
        !state.writable ? h('p', { className: css.notice }, t('settings.form.readOnly')) : null,
        // ---- 记忆清单（只读）-----------------------------------------------
        h(InventoryPanel, { ctx: props.ctx, t, scale }),
        // ---- 记忆规模（可写）-----------------------------------------------
        h(ScaleRows, { t, scale, disabled: scaleDisabled, editScale }),
        // ---- 笔记检索 ------------------------------------------------------
        h('h4', { className: css.group }, t('settings.notes.section')),
        h('p', { className: notes.available ? css.status : css.notice }, notesStatus),
        h(SettingRow, {
          title: t('settings.notes.repo.title'),
          hint: t('settings.notes.repo.hint'),
        }, repoControl),
        chooseError === ''
          ? null
          : h('p', { className: css.failed, role: 'status', key: 'choose-error' }, chooseError),
        h(SettingRow, {
          title: t('settings.notes.enabled.title'),
          hint: t('settings.notes.enabled.hint'),
        }, h(Switch, {
          checked: notesOn('enabled'),
          disabled: notesDisabled,
          label: t('settings.notes.enabled.title'),
          onChange: (next) => { editNote('enabled', next ? 'true' : 'false') },
        })),
        h(SettingRow, {
          title: t('settings.notes.timeout.title'),
          hint: t('settings.notes.timeout.hint'),
        },
          h('input', {
            className: css.number,
            type: 'number',
            min: 1000,
            max: 120000,
            step: 500,
            inputMode: 'numeric',
            'aria-label': t('settings.notes.timeout.title'),
            value: notes.fields.timeoutMs?.text ?? '',
            disabled: notesDisabled,
            'aria-invalid': notes.fields.timeoutMs?.invalid || undefined,
            onChange: (event) => { editNote('timeoutMs', event.target.value) },
          }),
          h('span', { className: css.unit }, t('settings.notes.unit.ms'))),
        h('div', { className: css.actions },
          state.failed ? h('p', { className: css.failed, role: 'status' }, t('settings.form.saveFailed')) : null,
          state.dirty ? h('span', { className: css.unsaved }, t('settings.unsaved')) : null,
          h(Button, {
            variant: 'primary',
            size: 'sm',
            disabled: saveBlocked,
            onClick: save,
          }, state.saving ? t('settings.form.saving') : t('settings.form.save'))))
    : h('p', { className: css.notice }, t('settings.form.unavailable'))

  return h('section', {
    className: css.page,
    'data-project-memory-settings': true,
  },
  h('h2', { className: css.title }, t('settings.nav')),
  h('p', { className: css.intro }, t('settings.intro')),
  body,
  // 弹层跟着分区一起渲染：关闭时组件返回 null，不在 DOM 里留任何残影。
  canPick
    ? h(NotesDirectoryDialog, {
      open: pickerOpen,
      value: notes.fields.repo?.text ?? '',
      directory: props.directory,
      t,
      onPick: (picked) => { editNote('repo', picked) },
      onClose: () => { setPickerOpen(false) },
    })
    : null)
}

/** 设置导航里的图标：一本带书签的笔记本。 */
export function settingsSectionIcon(size) {
  const px = Number.isFinite(size) && size > 0 ? size : 16
  const path = (d, key) => h('path', {
    key, d, fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round',
  })
  return h('svg', { width: px, height: px, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    path('M3.5 3.2h6.2a2.8 2.8 0 0 1 2.8 2.8v6.8H6.3A2.8 2.8 0 0 1 3.5 10V3.2Z', 'cover'),
    path('M3.5 10.2a2.8 2.8 0 0 1 2.8-2.8h6.2', 'spine'),
    path('M7.8 3.4v4.1l1.5-1 1.5 1V3.4', 'ribbon'))
}

/**
 * 注册设置分区（软依赖，永不抛出）。
 *
 * 两层门控：
 *   1. 嵌套 `inject(['slots','configForms','locale'])` —— 宿主没有这项服务时这里根本不跑；
 *   2. `slots.inject('settings.section')` —— 该版本没有这个槽时，不留下任何注册痕迹。
 */
export function registerSettingsSection(ctx) {
  if (typeof ctx?.inject !== 'function') return
  // 没有 configForms = 这个宿主没有设置页能力（老宿主），静默跳过是正确降级。
  // 但它存在、slots/locale 却缺一个时，嵌套 inject 会永远不回调且不报错——这时必须点名。
  if (service(ctx, 'configForms')) {
    const missing = ['slots', 'configForms', 'locale'].filter((name) => !service(ctx, name))
    if (missing.length) {
      console.warn(`[${SETTINGS_NS}] settings section unavailable: missing client service(s) ${missing.join(', ')}`)
    }
  }
  try {
    ctx.inject(['slots', 'configForms', 'locale'], (scope) => {
      try {
        mountSettingsSection(scope, ctx)
      } catch (err) {
        console.warn(`[${SETTINGS_NS}] settings section registration failed:`, err)
      }
    })
  } catch (err) {
    console.warn(`[${SETTINGS_NS}] settings section injection failed:`, err)
  }
}

/** 在已就绪的 scope 上挂载设置分区。 */
function mountSettingsSection(scope, root) {
  const slots = scope?.slots
  const configForms = scope?.configForms
  const locale = scope?.locale
  if (typeof slots?.inject !== 'function' || typeof configForms?.get !== 'function'
    || typeof locale?.register !== 'function' || typeof locale?.bind !== 'function') return
  // 保存按钮 / 开关来自宿主 ui-primitives：缺任何一个都别注册，避免渲染时才炸。
  //
  // ⚠ 组件不等于函数：宿主用 `forwardRef` 包了 Button（导出是对象 `{ $$typeof, render }`），
  // 用 `typeof x === 'function'` 判定会把它当成"不存在"，分区在真实宿主上整块消失。
  // 判定必须接受函数与对象两种导出形状。
  if (typeof SettingsFormModel !== 'function' || !isComponent(Switch) || !isComponent(Button)) {
    console.warn(`[${SETTINGS_NS}] host ui-primitives has no settings controls — settings section disabled`)
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
    // 同 namespace 已注册（HMR 没等到 disposer）：沿用既有词典，分区照常挂。
    console.warn(`[${SETTINGS_NS}] locale dictionary already registered:`, err)
  }
  const t = locale.bind(SETTINGS_NS)
  // 目录浏览通道用**根上下文**探测：`uiWorkspace` 是别的插件 provide 的扁平服务，
  // 只有根 ctx 的 `get()` 才稳定读得到（本 scope 是 configForms/locale 的子集）。
  const controller = new SettingsSectionController(
    configForms.get(SETTINGS_ENTRY_ID),
    directoryAccess(root),
    // 记忆清单要读会话列表与命令通道：这两项都在根 ctx 上，不在本 scope 的子集里。
    root,
  )
  keep(() => controller.dispose())
  keep(slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: SETTINGS_SECTION_ID,
    order: SETTINGS_SECTION_ORDER,
    label: () => t('settings.nav'),
    locale: SETTINGS_NS,
    inject: () => controller.inject(),
  }, MemorySettingsSection)))
  keep(slots.inject('settings.section.icon', () => slots.register({
    name: 'settings.section.icon',
    id: SETTINGS_SECTION_ID,
    order: SETTINGS_SECTION_ORDER,
    label: () => t('settings.nav'),
    locale: SETTINGS_NS,
  }, (props) => settingsSectionIcon(props === undefined || props === null ? SIZE : props.size))))
}

/** 图标兜底尺寸。 */
const SIZE = 16
