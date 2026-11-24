// 主题分类与主题门控（topic.js + auto-inject 接线）的行为测试。
// 锁四件事：
//   1. category 归一（别名/大小写/垃圾值）—— 不受控值会让门控永远不命中或永远命中；
//   2. `category` 派生进 `trigger.when.intents`（幂等）—— 这是"设了分类就等于该方面的词一出现就注入"的实现；
//   3. 主题门控只在**话题明确**时生效（空话题 = 不过滤），且三态 topicGate 各自管哪条通道；
//   4. 常驻任务卡按话题收口，其余主题折叠成计数行。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { TOPICS, detectTopics, categoryIntents, normalizeCategory, withCategoryTrigger } from '../src/memory/topic.js'
import { buildInjection, buildEntryContent, cfgEngine } from '../src/memory/auto-inject.js'
import { buildReadinessContext } from '../src/memory/readiness.js'

const cfg = (autoContext = {}) => cfgEngine({ autoContext })

/** 最小可用 store/globalStore：注入排程只读这两个方法。 */
const fakeStore = (items) => ({ insightItems: () => items, hasContent: true })
const fakeGlobal = (items = []) => ({ items: () => items })

function insight(over = {}) {
  return {
    id: 'ins_1',
    kind: 'decision',
    title: '编辑器配色走 CSS 变量',
    choice: '颜色统一在 tokens.css 里定义',
    category: 'style',
    trigger: { when: { ops: ['file-write'] } },
    ...over,
  }
}

test('category 归一：别名与大小写都落到受控主题键', () => {
  assert.equal(normalizeCategory('style'), 'style')
  assert.equal(normalizeCategory('Style'), 'style')
  assert.equal(normalizeCategory('风格'), 'style')
  assert.equal(normalizeCategory('架构'), 'arch')
  assert.equal(normalizeCategory(' release '), 'deploy')
  // 不受控的自由文本必须被丢掉：留着它等于门控失效。
  assert.equal(normalizeCategory('随便写的东西'), null)
  assert.equal(normalizeCategory(''), null)
  assert.equal(normalizeCategory(undefined), null)
  for (const key of Object.keys(categoryIntents('style'))) assert.ok(TOPICS.length > 0)
})

test('detectTopics：按命中词数排序、可限条数、无命中返回空数组', () => {
  assert.deepEqual(detectTopics('调一下配色和排版，字体也小'), ['style'])
  assert.deepEqual(detectTopics('重构模块边界，拆一下依赖方向'), ['arch'])
  assert.deepEqual(detectTopics('写测试用例，补覆盖率'), ['test'])
  assert.deepEqual(detectTopics(''), [])
  assert.deepEqual(detectTopics('今天天气不错'), [])
  const both = detectTopics('样式和架构都要动', { limit: 1 })
  assert.equal(both.length, 1)
})

test('withCategoryTrigger：把分类的意图词并进 when.intents，幂等且不动 ops/writes', () => {
  const ins = withCategoryTrigger(insight())
  assert.equal(ins.category, 'style')
  assert.ok(ins.trigger.when.intents.includes('配色'))
  assert.deepEqual(ins.trigger.when.ops, ['file-write'])
  const again = withCategoryTrigger(ins)
  assert.deepEqual(again.trigger.when.intents, ins.trigger.when.intents)
  // 没有 trigger 的条目也能获得触发面：分类本身就是触发条件。
  const bare = withCategoryTrigger({ id: 'x', title: 't', category: 'arch' })
  assert.ok(bare.trigger.when.intents.includes('模块边界'))
})

test('主题门控（topicGate=all）：话题明确且不匹配 → trigger 也不注入，并记 topic 丢弃', () => {
  const built = buildInjection({
    query: '重构模块边界',
    readiness: buildReadinessContext({ humanText: '重构模块边界', ops: ['file-write'] }),
    task: null,
    store: fakeStore([insight()]),
    globalStore: fakeGlobal(),
    cfg: cfg({ topicGate: 'all' }),
  })
  assert.equal(built.reasons.length, 0)
  const d = built.dropped.find((x) => x.id === 'ins_1')
  assert.equal(d.reason, 'topic')
  assert.deepEqual(d.topics, ['arch'])
})

test('主题门控：话题匹配 → 照常注入；话题为空 → 不过滤（宁松勿静默）', () => {
  const hit = buildInjection({
    query: '把配色改一下',
    readiness: buildReadinessContext({ humanText: '把配色改一下', ops: ['file-write'] }),
    task: null,
    store: fakeStore([insight()]),
    globalStore: fakeGlobal(),
    cfg: cfg({ topicGate: 'all' }),
  })
  assert.equal(hit.reasons.length, 1)
  assert.equal(hit.reasons[0].channel, 'trigger')

  const noTopic = buildInjection({
    query: '',
    readiness: buildReadinessContext({ ops: ['file-write'] }),
    task: null,
    store: fakeStore([insight()]),
    globalStore: fakeGlobal(),
    cfg: cfg({ topicGate: 'all' }),
  })
  assert.equal(noTopic.reasons.length, 1)
})

test('主题门控默认档（weak）：万能 op 命中受主题管，精确条件不受', () => {
  // file-write = 万能 op：在「架构」话题下不该把一条「风格」记忆全文顶进来
  const weak = buildInjection({
    query: '重构模块边界',
    readiness: buildReadinessContext({ humanText: '重构模块边界', ops: ['file-write'] }),
    task: null,
    store: fakeStore([insight()]),
    globalStore: fakeGlobal(),
    cfg: cfg(),
  })
  assert.equal(weak.reasons.length, 0)
  assert.equal(weak.dropped.find((d) => d.id === 'ins_1').reason, 'topic')

  // 精确条件（具体写目标）是作者写下的确定性契约：主题不匹配也照旧注入
  const precise = buildInjection({
    query: '重构模块边界',
    readiness: buildReadinessContext({ humanText: '重构模块边界 src/theme.css', ops: ['file-write'] }),
    task: null,
    store: fakeStore([insight({ id: 'ins_1', trigger: { when: { writes: ['src/theme.css'] } } })]),
    globalStore: fakeGlobal(),
    cfg: cfg(),
  })
  assert.equal(precise.reasons.length, 1)
  assert.match(precise.reasons[0].why, /^write:/)
})

test('topicGate=off：分类不影响注入', () => {
  const built = buildInjection({
    query: '重构模块边界',
    readiness: buildReadinessContext({ humanText: '重构模块边界', ops: ['file-write'] }),
    task: null,
    store: fakeStore([insight()]),
    globalStore: fakeGlobal(),
    cfg: cfg({ topicGate: 'off' }),
  })
  assert.equal(built.reasons.length, 1)
})

test('常驻任务卡：只展开本步主题的记忆，其余折叠成计数行', () => {
  const task = {
    id: 'task_1',
    title: '编辑器改版',
    steps: [],
    insights: [
      insight({ id: 'ins_style', title: '配色走变量', category: 'style' }),
      insight({ id: 'ins_arch', title: '模块边界按功能切', category: 'arch' }),
      insight({ id: 'ins_old', title: '没分类的老条目', category: undefined }),
    ],
  }
  const card = buildEntryContent(task, cfg(), { topics: ['style'] })
  assert.match(card, /ins_style/)
  assert.match(card, /ins_old/) // 未分类的老条目照旧展开
  assert.doesNotMatch(card, /ins_arch/)
  assert.match(card, /\+1 条其他主题未展开/)
  // 话题不明时不收口
  const all = buildEntryContent(task, cfg(), { topics: [] })
  assert.match(all, /ins_arch/)
})
