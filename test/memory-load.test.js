/**
 * 列表载荷归一化的契约测试（`client-memory-src/memory-load.js`）。
 *
 * 重点是 `root` 回执：设置页靠它分辨「宿主真的读了 root= 指的那个项目」和「宿主忽略了参数、
 * 悄悄返回了会话自己的项目」。这件事在界面上无法自证（两种情况的清单都长成一份合法载荷），
 * 所以归一化丢掉 `root` 就等于把判断依据丢了 —— 用测试钉死它。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseInsightPayloadText, parsePayloadText } from '../client-memory-src/memory-load.js'

/** 宿主的载荷是围栏 JSON（`记忆 project：2 条\n\n```json\n{...}\n```）。 */
function fenced(payload) {
  return `记忆 project：2 条（显示 2/2）\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``
}

test('parsePayloadText：围栏块优先，没有围栏时从最后一个 { 起截', () => {
  assert.deepEqual(parsePayloadText(fenced({ a: 1 })), { a: 1 })
  assert.deepEqual(parsePayloadText('前缀 noise {"a":1}'), { a: 1 })
  assert.equal(parsePayloadText(''), null)
  assert.equal(parsePayloadText('没有 JSON'), null)
  // 坏 JSON 不能被当成空载荷：null 与「解析不出来」是同一条信息，调用方据此报错。
  assert.equal(parsePayloadText('```json\n{坏}\n```'), null)
})

test('parseInsightPayloadText：带上宿主的 root 回执（跨项目读取是否真的生效的唯一依据）', () => {
  const parsed = parseInsightPayloadText(fenced({
    scope: 'project',
    root: '/home/me/note',
    count: 2,
    total: 2,
    offset: 0,
    nextOffset: null,
    items: [{ id: 'a' }, { id: 'b' }],
  }))
  assert.equal(parsed.root, '/home/me/note')
  assert.equal(parsed.total, 2)
  assert.equal(parsed.nextOffset, null)
  assert.deepEqual(parsed.items.map((item) => item.id), ['a', 'b'])
})

test('parseInsightPayloadText：老宿主没有 root 回执 → root 为 null（不是空串，也不是 undefined）', () => {
  const parsed = parseInsightPayloadText(fenced({ scope: 'project', count: 1, items: [{ id: 'a' }] }))
  assert.equal(parsed.root, null)
  // 没有 items 的载荷不是列表载荷（比如错误文本里恰好有 JSON）：返回 null 让调用方报「看不懂」。
  assert.equal(parseInsightPayloadText(fenced({ scope: 'project' })), null)
})
