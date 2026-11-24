/**
 * 记忆列表载荷（`/tasks insight list`）的可见性契约。
 *
 * 设置页「记忆与笔记」只做一件事：把记忆库摆到用户眼前。载荷少给一体，面板上就少一格 ——
 * 之前的缺口正是这一层：`files` / `symbols` 只下发数量，`trigger` 只下发 keywords/scope，
 * 于是界面只能写「文件 3」而说不出是哪三个、决策条的触发条件永远是空。
 *
 * 这一层是纯函数（listInsights），所以直接把契约钉在这里：清单与计数成对、截断不谎报、
 * 脏引用不进载荷。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { INSIGHT_CITATION_MAX, listInsights } from '../src/memory/commands/insight-actions.js'

/** 只实现 listInsights 用到的两个读取面的假 store。 */
function fakeStore(items) {
  return {
    insightItems: () => items,
    getTasks: () => [],
  }
}

test('files/symbols：计数是完整数量，清单是具体路径（成对下发）', () => {
  const out = listInsights(fakeStore([{
    id: 'ins_1',
    kind: 'decision',
    title: 'T',
    files: ['client.context.js', 'test/quota.test.js'],
    symbols: ['triggerLines'],
    updatedAt: '2026-11-24T00:00:00.000Z',
  }]), null, 'project', {})
  const item = out.items[0]
  assert.equal(item.files, 2)
  assert.deepEqual(item.fileList, ['client.context.js', 'test/quota.test.js'])
  assert.equal(item.symbols, 1)
  assert.deepEqual(item.symbolList, ['triggerLines'])
})

test('引用清单按 INSIGHT_CITATION_MAX 截断，但计数不被截断影响', () => {
  const files = Array.from({ length: INSIGHT_CITATION_MAX + 5 }, (_, i) => `src/f${i}.js`)
  const out = listInsights(fakeStore([{ id: 'ins_2', files, updatedAt: '2026-11-24T00:00:00.000Z' }]), null, 'project', {})
  const item = out.items[0]
  assert.equal(item.files, INSIGHT_CITATION_MAX + 5, '总数仍是完整的 45')
  assert.equal(item.fileList.length, INSIGHT_CITATION_MAX, '清单只带前 40 条')
  assert.equal(item.fileList[0], 'src/f0.js')
})

test('脏引用不进载荷：非字符串、空串、重复项丢掉', () => {
  const out = listInsights(fakeStore([{
    id: 'ins_3',
    files: ['a.js', ' a.js ', '', 42, null, 'b.js'],
    symbols: 'not-an-array',
    updatedAt: '2026-11-24T00:00:00.000Z',
  }]), null, 'project', {})
  const item = out.items[0]
  assert.deepEqual(item.fileList, ['a.js', 'b.js'])
  assert.equal(item.files, 2)
  assert.deepEqual(item.symbolList, [], '非数组字段降级成空清单，不抛错')
  assert.equal(item.symbols, 0)
})

test('trigger.when 原样透传（决策条目真正生效的那部分）', () => {
  const when = {
    writes: ['client-memory-src/**'],
    ops: ['file-write'],
    intents: ['面板', '展开'],
    guard: { paths: ['client-memory-src/**'], tags: ['prod'] },
  }
  const out = listInsights(fakeStore([{
    id: 'ins_4',
    trigger: { keywords: ['记忆'], scope: ['project'], when },
    updatedAt: '2026-11-24T00:00:00.000Z',
  }]), null, 'project', {})
  assert.deepEqual(out.items[0].trigger, { keywords: ['记忆'], scope: ['project'], when })
})

test('没有 trigger 时是 null（面板据此不画空块）', () => {
  const out = listInsights(fakeStore([{ id: 'ins_5', updatedAt: '2026-11-24T00:00:00.000Z' }]), null, 'project', {})
  assert.equal(out.items[0].trigger, null)
  assert.equal(out.items[0].files, 0)
  assert.equal(out.items[0].fileList.length, 0)
})

test('members 仍是合并过的任务数', () => {
  const out = listInsights(fakeStore([{
    id: 'ins_6',
    sourceTaskIds: ['t1', 't2', 't3'],
    updatedAt: '2026-11-24T00:00:00.000Z',
  }]), null, 'project', {})
  assert.equal(out.items[0].members, 3)
})
