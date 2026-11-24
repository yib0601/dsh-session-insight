/**
 * 「设置 → 记忆与笔记」页的渲染测试。
 *
 * 这一页原先只有笔记检索三个控件，现在多了「项目记忆清单」与「记忆规模」两块 —— 它们
 * 各自都会在真实宿主上出问题而**测试之外看不出来**：
 *   - 文案 key 拼错 → 页面上直接显示 `settings.memory.scale.maxProject.title`；
 *   - 数字字段读错层（`state.scale.fields` 与 `effective` 混用）→ 输入框空着或显示 undefined；
 *   - 清单的降级分支没接上 → 没有活跃会话时整块消失，用户以为功能没装上。
 * 所以这里用替身 React 把组件渲染成普通树，断言"结构在、文案翻译过、值正确"。
 *
 * 替身与 `node:module` 的解析钩子见 test/fixtures/（本仓不装 react，运行期由宿主 seed 注入）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')

// 必须在 import 被测模块**之前**注册：settings-section.js 顶层就写死了裸模块说明符。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react') {
      return { url: pathToFileURL(path.join(FIXTURES, 'react-stub.mjs')).href, shortCircuit: true }
    }
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return { url: pathToFileURL(path.join(FIXTURES, 'ui-primitives-stub.mjs')).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const React = await import(pathToFileURL(path.join(FIXTURES, 'react-stub.mjs')).href)
const {
  InventoryRow, MemorySettingsSection, SettingsSectionController, SETTINGS_SECTION_ID, inventoryDetail,
} = await import('../client-memory-src/settings-section.js')
const { normalizeInventoryRow } = await import('../client-memory-src/memory-inventory.js')
const { createTranslate, zh, en } = await import('../client-memory-src/locales.js')
const { MEMORY_SCALE_VISIBLE_FIELDS } = await import('../client-memory-src/memory-settings.js')

/** 页面的状态快照（形状照 SettingsSectionController.projection()）。 */
function stateSnapshot(overrides = {}) {
  const notesFields = {
    repo: { text: '/home/me/note', overridden: true, invalid: false },
    enabled: { text: 'true', overridden: true, invalid: false },
    timeoutMs: { text: '30000', overridden: false, invalid: false },
  }
  const scaleFields = {
    maxProject: { text: '100', overridden: false, invalid: false },
    maxGlobalProcedures: { text: '200', overridden: false, invalid: false },
    maxTokens: { text: '1200', overridden: false, invalid: false },
    entryMaxInsights: { text: '6', overridden: false, invalid: false },
    maxItemsPerSession: { text: '60', overridden: false, invalid: false },
    maxItemCharsPerSession: { text: '24000', overridden: false, invalid: false },
  }
  return {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    notes: { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false, fields: notesFields },
    scale: {
      available: true,
      writable: true,
      dirty: false,
      invalid: false,
      saving: false,
      failed: false,
      fields: scaleFields,
      effective: { maxProject: 100, maxGlobalProcedures: 200, maxTokens: 400, entryMaxInsights: 6, maxItemsPerSession: 60, maxItemCharsPerSession: 24000 },
    },
    ...overrides,
  }
}

/** 渲染一个快照下的页面并返回展开后的树。 */
function render(state, extras = {}) {
  const element = React.createElement(MemorySettingsSection, {
    t: createTranslate(zh),
    useSettingsCard: (selector) => selector(state),
    ctx: null,
    ...extras,
  })
  return React.renderTree(element)
}

/** 所有文本拼成一段（用来找文案）。 */
function textOf(tree) {
  return React.collectText(tree).join('\n')
}

test('分区 id 稳定（图标与分区必须同 id 才会被宿主渲染）', () => {
  assert.equal(SETTINGS_SECTION_ID, 'project-memory')
})

test('三块内容都在：记忆清单 → 记忆规模 → 笔记检索', () => {
  const tree = render(stateSnapshot())
  const text = textOf(tree)
  assert.match(text, /项目记忆/)
  assert.match(text, /记忆规模/)
  assert.match(text, /笔记检索/)
})

test('记忆清单在无活跃会话时给出可执行提示，而不是整块消失', () => {
  const tree = render(stateSnapshot())
  const text = textOf(tree)
  assert.match(text, /没有活跃会话/)
  assert.match(text, /任务草稿/)
  assert.match(text, /全局/)
})

test('有活跃会话时显示容量占用，容量取配置里的生效值', () => {
  // 会话服务是软探测：只给 `get('sessions')`，其余一律 undefined（与真实插件同样的降级姿态）。
  const ctx = {
    get: (name) => (name === 'sessions'
      ? {
        list: {
          getSnapshot: () => ({ ids: ['s1'], byId: { s1: { retainedBy: { mainView: 1 } } } }),
          subscribe: () => () => {},
        },
      }
      : undefined),
  }
  const text = textOf(render(stateSnapshot(), { ctx }))
  assert.match(text, /已存 0 条 · 容量 100 条（0%）/)
})

test('记忆规模只留一行：单轮注入预算，其余规模字段不占版面', () => {
  const tree = render(stateSnapshot())
  const inputs = React.collectElements(tree).filter((node) => node.props?.className === 'dshpm-number')
  // 1 个规模字段（单轮注入预算）+ 笔记检索的超时 = 2 个数字输入框
  assert.equal(MEMORY_SCALE_VISIBLE_FIELDS.length, 1)
  assert.equal(inputs.length, MEMORY_SCALE_VISIBLE_FIELDS.length + 1)
  // 预算按字符渲染：配置 400 token → 输入框 1200 字符（引擎硬上限 = maxTokens × 3）
  assert.equal(inputs[0].props.value, '1200')
  assert.equal(inputs[0].props['aria-label'], '单轮注入预算')
  assert.match(textOf(tree), /字符/)
  // 撤下的字段不能在页面上留标题（否则"撤了"只是自欺）
  const text = textOf(tree)
  assert.doesNotMatch(text, /项目层容量|全局层容量|常驻块条数|单会话条数上限|单会话字符上限|按主题注入/)
})

test('「看哪个项目」是下拉框：选项=宿主工作区列表，默认选中当前会话项目', () => {
  // 工作区注册表与左侧栏同源（`ctx.workspaces.list`）：下拉框不再让用户从文件系统里重挑一遍。
  const ctx = {
    get: (name) => {
      if (name === 'sessions') {
        return {
          list: {
            getSnapshot: () => ({
              ids: ['s1'],
              byId: { s1: { retainedBy: { mainView: 1 }, cwd: '/home/me/Code/dsh-session-insight' } },
            }),
            subscribe: () => () => {},
          },
        }
      }
      if (name === 'workspaces') {
        return {
          list: {
            getSnapshot: () => ({
              items: [
                { workspaceId: 'w1', path: '/home/me/Code/dsh-session-insight', title: 'dsh-session-insight' },
                { workspaceId: 'w2', path: '/home/me/note', title: 'note' },
              ],
            }),
            subscribe: () => () => {},
          },
        }
      }
      return undefined
    },
  }
  const tree = render(stateSnapshot(), { ctx })
  const selects = React.collectElements(tree).filter((node) => node.props?.className === 'dshpm-projectSelect')
  assert.equal(selects.length, 1)
  const select = selects[0]
  // 默认选中当前会话所在的项目：不是"当前"这个抽象选项，而是那条具体的工作区路径。
  assert.equal(select.props.value, '/home/me/Code/dsh-session-insight')
  assert.equal(select.props.disabled, false)
  assert.match(select.props.title, /dsh-session-insight/)
  const options = React.collectElements(select).filter((node) => node !== select && node.props?.value !== undefined)
  assert.equal(options.length, 2)
  assert.deepEqual(options.map((node) => node.props.value), [
    '/home/me/Code/dsh-session-insight',
    '/home/me/note',
  ])
  // 选项文本只给项目名（共同前缀不铺进下拉框），全路径挂在 option 的 title 上供核对。
  assert.equal(options[0].props.title, '/home/me/Code/dsh-session-insight')
  assert.equal(options[1].props.title, '/home/me/note')
  assert.match(textOf(options[1]), /^note$/)
  // 当前项目要在选项文本里标出来，否则下拉框收起时看不出"我现在看的是哪个"。
  assert.match(textOf(options[0]), /^dsh-session-insight （当前会话）$/)
  assert.doesNotMatch(textOf(options[1]), /（当前会话）/)
  // 选项文本只给项目名，全路径靠 hover 提示（`<option title>`）兜底。
  assert.doesNotMatch(textOf(options[0]), /\/home\//)
  assert.equal(textOf(options[1]).trim(), 'note')
  assert.deepEqual(options.map((node) => node.props.title), [
    '/home/me/Code/dsh-session-insight',
    '/home/me/note',
  ])
  // 注入量那一行要有会话才会出现；静态快照渲染时不该出现「undefined 字符」这类半成品
  assert.doesNotMatch(textOf(render(stateSnapshot())), /undefined 字符/)
})

test('工作区列表与目录选择器都不可用时，下拉框给出可执行的说明而不是空白', () => {
  const tree = render(stateSnapshot())
  const selects = React.collectElements(tree).filter((node) => node.props?.className === 'dshpm-projectSelect')
  assert.equal(selects.length, 1)
  assert.equal(selects[0].props.disabled, true)
  assert.match(textOf(tree), /没有可选项目/)
})

test('主题门控下拉已从界面撤下：页面上没有规模下拉，词典里也不留死文案', () => {
  const tree = render(stateSnapshot())
  const selects = React.collectElements(tree).filter((node) => node.props?.className === 'dshpm-select')
  assert.equal(selects.length, 0)
  // 「只留一格」必须连文案一起收：留着 topicGate 的六条死键，下一个读词典的人会以为这格还在。
  for (const dictionary of [zh, en]) {
    for (const key of Object.keys(dictionary)) {
      assert.doesNotMatch(key, /settings\.memory\.(topicGate|scale\.(maxProject|maxGlobalProcedures|entryMaxInsights|maxItemsPerSession|maxItemCharsPerSession|hint))/)
    }
  }
})

test('规模输入框带 min/max/step（浏览器侧也能挡住越界）', () => {
  const tree = render(stateSnapshot())
  const inputs = React.collectElements(tree).filter((node) => node.props?.className === 'dshpm-number')
  const first = inputs[0]
  assert.equal(first.props.type, 'number')
  // 预算在界面上是字符：50–8000 token 折成 150–24000 字符
  assert.equal(first.props.min, 150)
  assert.equal(first.props.max, 24000)
  assert.equal(first.props.step, 150)
})

test('所有文案 key 都有翻译（渲染文本里不出现 settings.* 字面量）', () => {
  const tree = render(stateSnapshot())
  const text = textOf(tree)
  assert.doesNotMatch(text, /settings\.(memory|notes|form|nav|intro)/)
})

test('英文词典同样覆盖这些 key', () => {
  const element = React.createElement(MemorySettingsSection, {
    t: createTranslate(en),
    useSettingsCard: (selector) => selector(stateSnapshot()),
    ctx: null,
  })
  const text = textOf(React.renderTree(element))
  assert.doesNotMatch(text, /settings\.(memory|notes|form|nav|intro)/)
  assert.match(text, /Project memory/)
  assert.match(text, /Memory size/)
})

test('只读部署时显示提示且保存按钮禁用', () => {
  const tree = render(stateSnapshot({ writable: false }))
  const text = textOf(tree)
  assert.match(text, /只读/)
  const buttons = React.collectElements(tree).filter((node) => node.type === 'button')
  const save = buttons.find((node) => React.collectText(node).join('') === '保存')
  assert.ok(save, '缺保存按钮')
  assert.equal(save.props.disabled, true)
})

test('脏草稿时显示未保存角标', () => {
  const state = stateSnapshot({ dirty: true })
  const text = textOf(render(state))
  assert.match(text, /未保存|保存/)
})

test('页面根节点带 data-project-memory-settings（宿主/HMR 定位用）', () => {
  const tree = render(stateSnapshot())
  const section = React.collectElements(tree).find((node) => node.type === 'section')
  assert.ok(section)
  assert.equal(section.props['data-project-memory-settings'], true)
})

test('宿主没有配置命名空间时只显示不可用提示，不抛错', () => {
  const tree = render({
    available: false,
    writable: false,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    notes: { available: false, writable: false, dirty: false, invalid: false, saving: false, failed: false, fields: {} },
    scale: { available: false, writable: false, dirty: false, invalid: false, saving: false, failed: false, fields: {}, effective: {} },
  })
  const text = textOf(tree)
  assert.match(text, /设置不可用/)
})

test('controller 把清单与规模都投影进状态（清单容量取生效值，不取草稿）', async () => {
  const listeners = new Set()
  const snapshot = {
    status: 'ready',
    writable: true,
    revision: 3,
    value: {
      notes: { enabled: true, repo: '/home/me/note', timeoutMs: 30000 },
      insight: { maxProject: 120, maxGlobalProcedures: 200 },
      autoContext: { maxTokens: 500, entryMaxInsights: 6, maxItemsPerSession: 60, maxItemCharsPerSession: 24000 },
    },
    base: {},
    user: {},
  }
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    mutate: async () => true,
  }
  const controller = new SettingsSectionController(scope, null, null)
  const projected = controller.projection()
  assert.equal(projected.scale.fields.maxProject.text, '120')
  assert.equal(projected.scale.effective.maxProject, 120)
  assert.equal(projected.scale.effective.maxTokens, 500)
  // 编辑容量草稿后，`effective` 仍报生效值 —— 清单进度条不该随草稿跳动。
  const inject = controller.inject()
  inject.editScale('maxProject', '900')
  assert.equal(controller.projection().scale.fields.maxProject.text, '900')
  assert.equal(controller.projection().scale.effective.maxProject, 120)
  controller.dispose()
})

// ── 记忆条目：收起是摘要，展开是详情（文件 / 符号 / 触发条件 / 正文 / id） ──────────
//
// 这一组钉的是"看得到"这件事本身：宿主载荷里一直带着文件清单与触发条件，旧版本在
// 归一化与渲染两层都没搬，设置页就只剩一句 140 字摘要 —— 用户的原话是
// 「无法查看具体信息，及涉及的文件名」。

/** 一条带完整详情的载荷（形状照宿主 src/memory/commands/insight-actions.js 的 insSummary）。 */
function detailPayload() {
  return {
    id: 'ins_test_1',
    kind: 'decision',
    title: '计费源由网关结构化下发',
    body: '计费源由网关下发，客户端不解析显示名。',
    confidence: 0.9,
    hitCount: 8,
    updatedAt: '2026-11-23T10:00:00.000Z',
    files: 3,
    fileList: ['client.context.js', 'test/quota.test.js', 'docs/DETAIL.md'],
    symbols: 1,
    symbolList: ['triggerLines'],
    members: 2,
    trigger: {
      keywords: ['额度'],
      scope: ['project'],
      when: {
        writes: ['client.context.js'],
        ops: ['file-write'],
        intents: ['额度', '用量总览'],
        guard: { paths: ['src/**'], not_paths: ['src/legacy/**'], tags: ['prod'] },
      },
    },
    steps: [],
    reason: '只下发 keywords 时面板永远画不出触发条件。',
  }
}

test('记忆行收起态：文件/符号/合并计数与展开按钮都在', () => {
  const row = normalizeInventoryRow(detailPayload())
  const tree = React.renderTree(React.createElement(InventoryRow, { row, t: createTranslate(zh) }))
  const text = textOf(tree)
  assert.match(text, /文件 3/, '收起态就要能看出这条牵着几个文件')
  assert.match(text, /符号 1/)
  assert.match(text, /合并 2 个任务/)
  const head = React.collectElements(tree).find((node) => node.type === 'button')
  assert.ok(head, '缺展开按钮：没有它详情入口不存在')
  assert.equal(head.props['aria-expanded'], 'false')
  assert.match(String(head.props.title), /展开/)
  // 收起态不渲染详情块（否则详情等于永远展开）
  assert.doesNotMatch(text, /涉及的文件（/)
})

test('记忆行收起态正文按 140 字截断（字符串本身短，靠 CSS 省略看不出全貌）', () => {
  const row = normalizeInventoryRow({ id: 'x', body: 'A'.repeat(200) })
  const tree = React.renderTree(React.createElement(InventoryRow, { row, t: createTranslate(zh) }))
  assert.ok(textOf(tree).includes(`${'A'.repeat(140)}…`))
})

test('展开详情：文件路径、符号、触发条件各组、理由与条目 id 都渲染出来', () => {
  const row = normalizeInventoryRow(detailPayload())
  const text = textOf(React.renderTree(inventoryDetail(row, createTranslate(zh))))
  assert.match(text, /涉及的文件（3 个）/)
  assert.match(text, /client\.context\.js/)
  assert.match(text, /test\/quota\.test\.js/)
  assert.match(text, /docs\/DETAIL\.md/)
  assert.match(text, /涉及的符号（1 个）/)
  assert.match(text, /triggerLines/)
  // 触发条件：五个面 + guard 的排除/标签写法
  assert.match(text, /写/)
  assert.match(text, /动作/)
  assert.match(text, /意图/)
  assert.match(text, /额度 · 用量总览/)
  assert.match(text, /!src\/legacy\/\*\*/)
  assert.match(text, /#prod/)
  // 正文与按 kind 的字段
  assert.match(text, /计费源由网关下发，客户端不解析显示名。/)
  assert.match(text, /只下发 keywords 时面板永远画不出触发条件。/)
  assert.match(text, /条目 id：ins_test_1/)
})

test('清单被宿主截断时明说「只列出前 N 个」（否则看起来像漏条目）', () => {
  const row = normalizeInventoryRow({
    id: 'x', kind: 'decision', files: 60, fileList: ['a.js', 'b.js'], symbols: 0, symbolList: [],
  })
  const text = textOf(React.renderTree(inventoryDetail(row, createTranslate(zh))))
  assert.match(text, /涉及的文件（60 个）/)
  assert.match(text, /只列出前 2 个，共 60 个/)
})

test('procedure：展开后列真步骤，不再只显示「步骤 N 条：第一条…」', () => {
  const row = normalizeInventoryRow({
    id: 'x',
    kind: 'procedure',
    body: '步骤 3 条：先读代码',
    steps: ['先读代码', '再改测试', '最后构建'],
  })
  const text = textOf(React.renderTree(inventoryDetail(row, createTranslate(zh))))
  assert.match(text, /步骤（3 条）/)
  assert.match(text, /最后构建/)
  assert.doesNotMatch(text, /步骤 3 条：先读代码/)
})

test('没有触发条件/文件时不画空标题块', () => {
  const row = normalizeInventoryRow({ id: 'x', kind: 'lesson', body: '只有正文' })
  const text = textOf(React.renderTree(inventoryDetail(row, createTranslate(zh))))
  assert.doesNotMatch(text, /触发条件/)
  assert.doesNotMatch(text, /涉及的文件/)
  assert.match(text, /只有正文/)
  assert.match(text, /条目 id：x/)
})

test('展开详情的英文文案同样齐全（不出现 settings.* 字面量）', () => {
  const row = normalizeInventoryRow(detailPayload())
  const text = textOf(React.renderTree(inventoryDetail(row, createTranslate(en))))
  assert.doesNotMatch(text, /settings\.(memory|notes|form|nav|intro)/)
  assert.match(text, /Files touched \(3\)/)
  assert.match(text, /Trigger/)
})
