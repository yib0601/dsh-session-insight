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
 * 页面上只有一组控件：笔记检索三项（`notes.repo` 这类嵌套路径），走 notes-settings.js
 * 自己的 mutate 表单。记忆那三个顶层旋钮随语料索引层下线后，宿主 `SettingsFormModel`
 * 只用来提供 SnapshotStore 与 scope 订阅，字段表是空的。
 */
import {
  Button, SettingsFormModel, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useEffect, useState } from 'react'
import { service } from './services.js'
import { NOTES_FIELDS, NotesSettingsForm } from './notes-settings.js'
import { NotesDirectoryDialog } from './NotesDirectoryDialog.js'
import { directoryAccess } from './notes-directory.js'
import { createTranslate, en, zh } from './locales.js'
import { settingsCss as css } from './styles.js'

/** 本 bundle 在 profile 的 loader 条目 id（cordis.patch.yml 定死的那个），也是 settings 命名空间。 */
export const SETTINGS_ENTRY_ID = 'dsh-turn-cost'
/** 设置面板里的分区 id；图标注册必须用同一个 id 才会被渲染。 */
export const SETTINGS_SECTION_ID = 'project-memory'
/** 分区在设置导航里的位置（费用 30 / 模型目录 31 之后）。 */
export const SETTINGS_SECTION_ORDER = 32
/** 本页文案的 locale 命名空间。与面板共用一份词典，但独立注册，互不影响。 */
export const SETTINGS_NS = 'dsh-project-memory.settings'

/**
 * 本页只有笔记检索一组控件。
 *
 * 记忆那三个顶层旋钮（启动全量索引 / 刷新间隔 / 检索时扩展查询）随语料索引层一起下线：
 * 代码结构归 codegraph、笔记语料归 `search_notes`，这页再暴露"索什么、多久刷、要不要扩写"
 * 只会让人以为项目的记忆是靠扫盘建立的。项目记忆的实质入口是 insight（`save_lesson` 的
 * decision / lesson / procedure）与任务，它们不经过索引，也没有可调频率。
 */

/** 把 settings 命名空间桥到本页的状态上。 */
export class SettingsSectionController {
  /**
   * @param scope - 本条目在 `configForms` 里的 scope（读写宿主设置）。
   * @param directory - 目录浏览通道（`uiWorkspace.listDirectory` 的软包装）；
   *   宿主没有这项能力时传 `null`，设置页回退成手写输入框。
   */
  constructor(scope, directory = null) {
    // 记忆那三个顶层旋钮（启动全量索引 / 刷新间隔 / 检索时扩展查询）随语料索引层一起下线，
    // 所以这张表单**故意空着**：它仍然负责给本页提供 SnapshotStore 与 scope 订阅
    // （`bind()` 是宿主唯一现成的那个实现），但不再持有任何可编辑字段。
    this.form = new SettingsFormModel(scope, [])
    // 笔记三项走自己的表单：宿主的 SettingsFormModel 只能寻址顶层键，而它们是
    // `notes.repo` 这类嵌套路径（见 notes-settings.js 的头注释）。
    this.notes = new NotesSettingsForm(scope)
    this.directory = directory
    this.store = this.form.bind(() => this.projection())
    this.unsubscribeNotes = this.notes.subscribe(() => { this.store.set(this.projection()) })
  }

  /** 构造槽位注入面。 */
  inject() {
    return {
      hooks: { settingsCard: this.store },
      directory: this.directory,
      ...this.notes.actions(),
      save: () => { void this.saveAll() },
      discard: () => {
        this.form.actions().discard()
        this.notes.discard()
      },
    }
  }

  /** 一次保存点同时落两份草稿；记忆那份失败就不动笔记那份。 */
  async saveAll() {
    await this.form.save()
    if (this.form.shell().failed) return
    await this.notes.save()
  }

  /** 释放对宿主命名空间的订阅。 */
  dispose() {
    this.unsubscribeNotes?.()
    this.notes.dispose()
    this.form.dispose()
  }

  projection() {
    const notesFields = {}
    for (const field of NOTES_FIELDS) notesFields[field] = this.notes.field(field)
    const base = this.form.shell()
    const notes = this.notes.shell()
    return {
      available: base.available,
      writable: base.writable && (!notes.available || notes.writable),
      dirty: base.dirty || notes.dirty,
      invalid: base.invalid || notes.invalid,
      saving: base.saving || notes.saving,
      failed: base.failed || notes.failed,
      notes: { ...notes, fields: notesFields },
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
}

/** 非 Hook 的稳定回退：hook 数量在两次渲染之间不变，避免条件调用 Hooks。 */
const fallbackHook = (selector) => selector(UNAVAILABLE_STATE)

/** 渲染设置页。 */
export function MemorySettingsSection(props) {
  const t = props.t ?? createTranslate(zh)
  const useSettingsCard = props.useSettingsCard ?? fallbackHook
  const state = useSettingsCard((snapshot) => snapshot)
  const discard = props.discard
  // 离开这一页时丢掉未保存的草稿（与宿主设置表单的约定一致）。
  useEffect(() => () => { discard?.() }, [discard])
  const editNotes = props.editNotes
  const save = props.save
  const disabled = !state.writable || state.saving
  // 笔记那段的状态活在独立表单里（嵌套路径），缺宿主命名空间时回退到占位形状。
  const notes = state.notes ?? UNAVAILABLE_STATE.notes
  const notesDisabled = disabled || !notes.available || !notes.writable
  const notesOn = (field) => notes.fields[field]?.text === 'true'
  const editNote = (field, text) => { editNotes?.(field, text) }
  const notesPath = notes.fields.repo.text.trim()
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
          value: notes.fields.repo.text,
          disabled: notesDisabled,
          'aria-invalid': notes.fields.repo.invalid || undefined,
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
            value: notes.fields.timeoutMs.text,
            disabled: notesDisabled,
            'aria-invalid': notes.fields.timeoutMs.invalid || undefined,
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
      value: notes.fields.repo.text,
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
