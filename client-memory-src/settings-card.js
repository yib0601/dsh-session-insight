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
import {
  Button, SettingsFormModel, Switch, settingsNumberField,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useEffect } from 'react'
import { service } from './services.js'
import { IconChevronDownOutline14 } from './icons.js'
import { createTranslate, en, zh } from './locales.js'
import { settingsCss as css } from './styles.js'

/** 合并后的包名：`plugins.bundle.config` 的 key 必须与 profile 里安装的包名一致。 */
export const SETTINGS_PACKAGE_NAME = '@local/dsh-turn-cost'
/** 本 bundle 在 profile 的 loader 条目 id（cordis.patch.yml 定死的那个），也是 settings 命名空间。 */
export const SETTINGS_ENTRY_ID = 'dsh-turn-cost'
/** 卡片文案的 locale 命名空间。与面板共用一份词典，但独立注册，互不影响。 */
export const SETTINGS_NS = 'dsh-project-memory.settings'

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
export const SETTINGS_FIELDS = [
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
export class SettingsCardController {
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
export function SettingsCard(props) {
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
export function registerSettingsCard(ctx) {
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
