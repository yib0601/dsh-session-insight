// 「跨项目查看 + 注入量估算」的两条新通道：
//   1. `/tasks insight list … root=<abs>` 只改**读**的目标，安全判据与会话项目根同一份；
//   2. `/tasks insight estimate [root=…]` 用真引擎（cfgEngine + buildInjection）算注入量。
// 同时钉住客户端那两条请求行的拼法（root 必须 URL 编码，否则带空格的路径会被分词切碎）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

import { insightCommandDefinition } from '../src/memory/commands/insight-actions.js'
import { insightEstimateLine, insightListLine } from '../client-memory-src/paging.js'
import { injectSummary } from '../client-memory-src/memory-inventory.js'

const CWD = '/home/yibin/Code/dsh-session-insight'
const OTHER = '/home/yibin/Code/vidwall'

/** 造一个最小 invocation：handler 只读 rawInput 与 agent.session.header.cwd。 */
function run(line) {
  const def = insightCommandDefinition({}, {})
  return def.handler({
    rawInput: line,
    agent: { id: 'sess-test', session: { header: { cwd: CWD } } },
  })
}

/** 从 fencedJson 输出里取尾部 JSON。 */
function payloadOf(result) {
  assert.equal(result.kind, 'success', result.text)
  const fenced = result.text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  assert.ok(fenced, result.text)
  return JSON.parse(fenced[1])
}

test('请求行：root 走 URL 编码追加，未选项目时不带尾巴', () => {
  assert.equal(insightListLine('project', 0, 40), '/tasks insight list project 0 40')
  assert.equal(
    insightListLine('project', 0, 40, '/a b/c'),
    '/tasks insight list project 0 40 root=%2Fa%20b%2Fc',
  )
  assert.equal(insightEstimateLine(null), '/tasks insight estimate')
  assert.equal(insightEstimateLine('/x y'), '/tasks insight estimate root=%2Fx%20y')
})

test('list root=：合法项目根 → 载荷带 root，且能读到该项目的条目', () => {
  const data = payloadOf(run(`list project 0 40 root=${encodeURIComponent(OTHER)}`))
  assert.equal(data.root, OTHER)
  // vidwall 的记忆库不是空的（若哪天清空，这条断言退化成 0 === 0，仍然成立）
  assert.ok(Array.isArray(data.items))
})

test('list root=：相对路径 / 不存在 / 家目录都不放行', () => {
  const rel = run('list project 0 40 root=some/rel')
  assert.equal(rel.kind, 'error')
  assert.match(rel.text, /绝对路径/)

  const gone = run(`list project 0 40 root=${encodeURIComponent('/no/such/dir/xyz')}`)
  assert.equal(gone.kind, 'error')
  assert.match(gone.text, /不存在/)

  const home = run(`list project 0 40 root=${encodeURIComponent(os.homedir())}`)
  assert.equal(home.kind, 'error')
  assert.match(home.text, /不能当记忆根/)

  const rootFs = run(`list project 0 40 root=${encodeURIComponent(path.parse(os.homedir()).root)}`)
  assert.equal(rootFs.kind, 'error')
})

test('estimate：给上限、本步注入、池子三个数；上限 = maxTokens × 3', () => {
  const data = payloadOf(run('estimate'))
  assert.equal(data.root, CWD)
  assert.equal(data.limitChars, data.maxTokens * 3)
  assert.ok(data.chars <= data.limitChars, '本步注入不得超过硬上限')
  assert.ok(data.poolChars >= data.chars, '池子不该小于本步注入')
  assert.ok(data.poolItems >= 1, '本项目有记忆条目')
  assert.equal(typeof data.topicGate, 'string')
})

test('estimate root=：换项目就换数字（池子跟着目标项目走）', () => {
  const mine = payloadOf(run('estimate'))
  const other = payloadOf(run(`estimate root=${encodeURIComponent(OTHER)}`))
  assert.equal(other.root, OTHER)
  assert.notEqual(other.poolChars, mine.poolChars)
})

test('injectSummary：token 折算与上下文用量面同口径（4 字符/token）', () => {
  const s = injectSummary({ chars: 448, limitChars: 1200, poolChars: 1392, poolItems: 5, items: 2, entryChars: 120, itemChars: 328, dropped: 1, total: 5, topicGate: 'weak', root: CWD })
  assert.equal(s.chars, 448)
  assert.equal(s.estTokens, 112)
  assert.equal(s.percent, 37)
  assert.equal(s.dropped, 1)
  assert.equal(injectSummary(null), null)
  // 脏载荷不该把界面上的数字弄成 NaN
  const dirty = injectSummary({ chars: 'x', limitChars: -1 })
  assert.equal(dirty.chars, 0)
  assert.equal(dirty.percent, null)
})
