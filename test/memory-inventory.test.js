/**
 * 「记忆清单」纯逻辑的测试（client-memory-src/memory-inventory.js）。
 *
 * 锁三件事：
 *   1. **占用口径**：`used` 取宿主 `total`（含归档），否则进度条会永远差一截，看起来像容量
 *      没生效 —— 写入侧 prune 判的就是含归档条数。
 *   2. **容量字段映射**：项目层看 `maxProject`、全局层看 `maxGlobalProcedures`、任务层没有容量
 *      （不能画一条永远 0% 的假进度条）。
 *   3. 脏数据不留坑：没有 id 的行丢掉（否则 React key 互相顶替）、非法比例归 null。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MEMORY_SCOPES, emptyInventory, inventoryRows, normalizeInventoryRow, normalizeTrigger,
  scopeCapacityField, summarizeInventory, usagePercent,
} from '../client-memory-src/memory-inventory.js'

test('页签顺序：项目层在前（设置页是"我这个项目记住了什么"的入口）', () => {
  assert.deepEqual(MEMORY_SCOPES, ['project', 'task', 'global'])
})

test('容量字段：项目层 maxProject、全局层 maxGlobalProcedures、任务层没有', () => {
  assert.equal(scopeCapacityField('project'), 'maxProject')
  assert.equal(scopeCapacityField('global'), 'maxGlobalProcedures')
  assert.equal(scopeCapacityField('task'), null)
  assert.equal(scopeCapacityField('__proto__'), null)
})

test('占用取宿主 total（含归档），比例按容量夹在 0..1', () => {
  const stats = summarizeInventory({
    items: [{ id: 'a', archived: false }, { id: 'b', archived: true }],
    total: 23,
    capacity: 100,
  })
  assert.equal(stats.used, 23)
  assert.equal(stats.capacity, 100)
  assert.equal(stats.ratio, 0.23)
  assert.equal(stats.archived, 1)
  assert.equal(stats.drafts, 0)
  assert.equal(stats.shown, 2)
})

test('没有容量时 ratio 为 null（界面不画进度条）', () => {
  const stats = summarizeInventory({ items: [{ id: 'a' }], total: 1, capacity: null })
  assert.equal(stats.capacity, null)
  assert.equal(stats.ratio, null)
  assert.equal(usagePercent(stats.ratio), null)
})

test('已用量永不小于实际拿到的行数（载荷缺 total 时不至于显示 0）', () => {
  const stats = summarizeInventory({ items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
  assert.equal(stats.used, 3)
  assert.equal(stats.total, undefined)
})

test('越界容量按 0..1 夹住，百分比取整', () => {
  const stats = summarizeInventory({ items: [], total: 300, capacity: 100 })
  assert.equal(stats.ratio, 1)
  assert.equal(usagePercent(stats.ratio), 100)
  assert.equal(usagePercent(0.234), 23)
  assert.equal(usagePercent(Number.NaN), null)
})

test('行归一化：缺字段有默认、脏 kind 不被吞掉、task 层带任务名', () => {
  const row = normalizeInventoryRow({
    id: 'ins_1', kind: 'decision', title: 'T', body: 'B', confidence: 0.9, hitCount: 3,
    updatedAt: '2026-11-24T01:00:00.000Z', taskTitle: '任务 A',
  })
  assert.deepEqual(row, {
    id: 'ins_1',
    kind: 'decision',
    title: 'T',
    body: 'B',
    draft: false,
    archived: false,
    confidence: 0.9,
    hitCount: 3,
    updatedAt: '2026-11-24T01:00:00.000Z',
    taskTitle: '任务 A',
    // 详情面的缺省：计数 0、清单空、触发条件 null —— 界面据此不画空块，而不是画一排「文件 0」。
    files: 0,
    fileList: [],
    symbols: 0,
    symbolList: [],
    members: 0,
    trigger: null,
    steps: [],
    problem: null,
    choice: null,
    reason: null,
    fix: null,
    solution: null,
    pattern: null,
  })
  const bare = normalizeInventoryRow({ id: 'x', kind: '', confidence: 'high', hitCount: -1 })
  assert.equal(bare.kind, 'lesson')
  assert.equal(bare.confidence, null)
  assert.equal(bare.hitCount, 0)
  assert.equal(bare.taskTitle, null)
})

test('没有 id 或 id 重复的条目被丢掉（否则渲染 key 互相顶替）', () => {
  const rows = inventoryRows([
    { id: 'a', kind: 'lesson' },
    { id: '', kind: 'lesson' },
    { kind: 'lesson' },
    { id: 'a', kind: 'decision' },
    { id: 'b', kind: 'procedure' },
  ])
  assert.deepEqual(rows.map((row) => row.id), ['a', 'b'])
})

test('非数组输入返回空列表', () => {
  assert.deepEqual(inventoryRows(undefined), [])
  assert.deepEqual(inventoryRows(null), [])
  assert.deepEqual(inventoryRows({}), [])
})

test('初始状态形状稳定（组件与测试共用）', () => {
  assert.deepEqual(emptyInventory(), {
    scope: 'project', rows: [], total: 0, nextOffset: null, loading: false, error: null, loaded: false,
  })
})

// ── 详情面：数据一直在宿主载荷里，旧版本在归一化这一步丢了它 ─────────────────────

test('涉及的文件与符号：清单原样保留，计数与清单各自独立', () => {
  const row = normalizeInventoryRow({
    id: 'ins_2',
    kind: 'decision',
    files: 3,
    fileList: ['client-memory-src/styles.js', ' client-memory-src/locales.js ', 'client-memory-src/styles.js', 42],
    symbols: 2,
    symbolList: ['DETAIL_FIELDS', 'triggerLines'],
    members: 4,
  })
  assert.equal(row.files, 3, '计数取宿主给的完整数量')
  assert.deepEqual(row.fileList, ['client-memory-src/styles.js', 'client-memory-src/locales.js'],
    '去空白、去重、丢掉非字符串（重复项会让 React key 顶替）')
  assert.equal(row.symbols, 2)
  assert.deepEqual(row.symbolList, ['DETAIL_FIELDS', 'triggerLines'])
  assert.equal(row.members, 4)
})

test('脏计数归 0，不把负数/字符串画成「-1 个文件」', () => {
  const row = normalizeInventoryRow({ id: 'x', files: -2, symbols: '3', members: Number.NaN })
  assert.equal(row.files, 0)
  assert.equal(row.symbols, 0)
  assert.equal(row.members, 0)
})

test('触发条件：when 的五个面 + guard 都保留（决策条目真正生效的那部分）', () => {
  const trigger = normalizeTrigger({
    keywords: ['额度'],
    scope: ['project'],
    when: {
      writes: ['client.context.js'],
      ops: ['file-write'],
      intents: ['额度', '用量总览'],
      paths: ['src/**'],
      hosts: ['wsl'],
      guard: { paths: ['src/**'], not_paths: ['src/legacy/**'], tags: ['prod'] },
    },
  })
  assert.deepEqual(trigger.keywords, ['额度'])
  assert.deepEqual(trigger.when.writes, ['client.context.js'])
  assert.deepEqual(trigger.when.ops, ['file-write'])
  assert.deepEqual(trigger.when.intents, ['额度', '用量总览'])
  assert.deepEqual(trigger.when.paths, ['src/**'])
  assert.deepEqual(trigger.when.hosts, ['wsl'])
  assert.deepEqual(trigger.when.guard, { paths: ['src/**'], notPaths: ['src/legacy/**'], tags: ['prod'] })
})

test('触发条件全空时归一成 null（界面不画空标题块）', () => {
  assert.equal(normalizeTrigger(null), null)
  assert.equal(normalizeTrigger(undefined), null)
  assert.equal(normalizeTrigger({}), null)
  assert.equal(normalizeTrigger({ keywords: [], scope: [], when: null }), null)
  assert.equal(normalizeTrigger({ when: { writes: [], ops: [] } }), null)
  // 老格式只有 keywords：仍然是有效触发条件
  assert.deepEqual(normalizeTrigger({ keywords: ['撞库'] }).keywords, ['撞库'])
})

test('步骤与各 kind 正文：原样保留，空白串归一成 null', () => {
  const row = normalizeInventoryRow({
    id: 'ins_3',
    kind: 'procedure',
    steps: ['先读代码', '  ', '再改测试'],
    problem: '面板只显示摘要',
    choice: '   ',
    reason: '用户看不到文件',
  })
  assert.deepEqual(row.steps, ['先读代码', '再改测试'])
  assert.equal(row.problem, '面板只显示摘要')
  assert.equal(row.choice, null)
  assert.equal(row.reason, '用户看不到文件')
})
