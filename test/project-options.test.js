/**
 * 下拉框行模型的单测（`client-memory-src/project-options.js`）。
 *
 * 这一层决定"当前会话项目是哪一条、选中项落在哪、外来目录怎么补进选项"—— 三条都是
 * 界面上看不出错的地方：选错一条只是清单看错了项目；漏补外来目录是 `<select>` 的 value
 * 对不上任何 option，浏览器显示成空白（用户会以为项目丢了）。所以用纯函数断言边界。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  basename, cwdRows, pathKey, projectModel, projectOptionLabel, samePath, shortPath, workspaceRows,
} from '../client-memory-src/project-options.js'
import { sessionCwd } from '../client-memory-src/session-id.js'

const WORKSPACES = {
  items: [
    { workspaceId: 'w1', path: '/home/me/Code/dsh-session-insight', title: 'dsh-session-insight' },
    { workspaceId: 'w2', path: '/home/me/note', title: '笔记' },
    { workspaceId: 'w3', path: '/home/me/Code/aurora-source', title: '' },
  ],
}

/** 会话快照：s1 在 w1 的目录里跑，s2 在一个没注册成工作区的目录里。 */
const SESSIONS = {
  ids: ['s1', 's2'],
  byId: {
    s1: { id: 's1', cwd: '/home/me/Code/dsh-session-insight/', retainedBy: { mainView: 1 } },
    s2: { id: 's2', cwd: '/tmp/scratch', retainedBy: { mainView: 0 } },
  },
}

test('basename / pathKey / samePath：尾斜杠与重复斜杠不算不同目录', () => {
  assert.equal(basename('/home/me/Code/note/'), 'note')
  assert.equal(basename('/home/me/Code/note'), 'note')
  assert.equal(basename(''), '')
  assert.equal(pathKey(' /home/me/Code//note/ '), '/home/me/Code/note')
  assert.equal(samePath('/home/me/Code/note/', '/home/me/Code/note'), true)
  assert.equal(samePath('/home/me/Code/note', '/home/me/Code/other'), false)
  // 空路径永不算相等：否则"没有项目"会跟任何一项匹配上。
  assert.equal(samePath('', ''), false)
})

test('shortPath 从中间省略，但末两级目录一定保住', () => {
  const long = '/home/me/Code/dsh-session-insight/client-memory-src/deep/nested/dir'
  const short = shortPath(long, 40)
  assert.ok(short.length <= 40 + 8)
  assert.match(short, /nested\/dir$/)
  assert.equal(shortPath('/a/b', 40), '/a/b')
})

test('workspaceRows：跳过没路径/重复的行，标题缺省用目录名', () => {
  const rows = workspaceRows(WORKSPACES)
  assert.deepEqual(rows.map((row) => row.path), [
    '/home/me/Code/dsh-session-insight',
    '/home/me/note',
    '/home/me/Code/aurora-source',
  ])
  assert.equal(rows[2].title, 'aurora-source')
  // 裸数组与空值都要能吃：宿主契约之外还给了两种退化输入。
  assert.equal(workspaceRows(WORKSPACES.items).length, 3)
  assert.deepEqual(workspaceRows(undefined), [])
  assert.deepEqual(workspaceRows({ items: [{ path: '' }, { title: 'x' }] }), [])
})

test('sessionCwd：只认字符串 cwd，两种快照形状都能取（且不把空串当路径）', () => {
  assert.equal(sessionCwd(SESSIONS, 's2'), '/tmp/scratch')
  assert.equal(sessionCwd({ items: [{ sessionId: 'old', cwd: '/old' }] }, 'old'), '/old')
  assert.equal(sessionCwd(SESSIONS, 'nope'), null)
  assert.equal(sessionCwd(SESSIONS, ''), null)
  assert.equal(sessionCwd({ ids: ['x'], byId: { x: { cwd: '' } } }, 'x'), null)
})

test('cwdRows：注册表不可用时用会话 cwd 兜底，并去重', () => {
  const rows = cwdRows({ ids: ['a', 'b'], byId: { a: { cwd: '/x/one' }, b: { cwd: '/x/one/' } } })
  assert.deepEqual(rows, [{ path: '/x/one', title: 'one' }])
})

test('projectModel：选项来自工作区注册表，默认选中当前会话项目', () => {
  const model = projectModel({ workspaces: WORKSPACES, sessions: SESSIONS, sessionId: 's1', override: null })
  assert.equal(model.currentPath, '/home/me/Code/dsh-session-insight')
  assert.equal(model.selected, '/home/me/Code/dsh-session-insight')
  assert.equal(model.foreign, false)
  assert.deepEqual(model.options.map((option) => option.current), [true, false, false])
})

test('projectModel：选了别的项目 → 选中它并标记为只读外来视图', () => {
  const model = projectModel({
    workspaces: WORKSPACES, sessions: SESSIONS, sessionId: 's1', override: '/home/me/note',
  })
  assert.equal(model.selected, '/home/me/note')
  assert.equal(model.foreign, true)
  assert.equal(model.options.length, 3)
})

test('projectModel：覆盖指向已注册工作区时复用那一行，不重复补外来选项', () => {
  const model = projectModel({
    workspaces: WORKSPACES, sessions: SESSIONS, sessionId: 's1', override: '/home/me/note/',
  })
  assert.equal(model.selected, '/home/me/note')
  assert.equal(model.options.length, 3)
  assert.equal(model.options.filter((option) => option.foreign).length, 0)
})

test('projectModel：覆盖指向未注册目录 → 补一条外来选项（否则 select 的 value 对不上）', () => {
  const model = projectModel({
    workspaces: WORKSPACES, sessions: SESSIONS, sessionId: 's1', override: '/tmp/elsewhere',
  })
  const extra = model.options.at(-1)
  assert.deepEqual(extra, { path: '/tmp/elsewhere', title: 'elsewhere', current: false, foreign: true })
  assert.equal(model.selected, '/tmp/elsewhere')
  assert.equal(model.foreign, true)
})

test('projectModel：注册表缺失时退化到会话 cwd 列表，当前项目仍可选', () => {
  const model = projectModel({ workspaces: undefined, sessions: SESSIONS, sessionId: 's2', override: null })
  assert.equal(model.currentPath, '/tmp/scratch')
  assert.equal(model.selected, '/tmp/scratch')
  assert.deepEqual(model.options.map((option) => option.path), [
    '/home/me/Code/dsh-session-insight',
    '/tmp/scratch',
  ])
  assert.equal(model.options.find((option) => option.current).path, '/tmp/scratch')
})

test('projectModel：会话 cwd 不在注册表里 → 补一条并标成当前项目', () => {
  const model = projectModel({
    workspaces: WORKSPACES,
    sessions: { ids: ['s9'], byId: { s9: { cwd: '/tmp/scratch' } } },
    sessionId: 's9',
    override: null,
  })
  assert.equal(model.options[0].path, '/tmp/scratch')
  assert.equal(model.options[0].current, true)
  assert.equal(model.selected, '/tmp/scratch')
})

test('projectModel：没有会话也没有注册表时给空模型，不抛错', () => {
  const model = projectModel({})
  assert.deepEqual(model.options, [])
  assert.equal(model.currentPath, null)
  assert.equal(model.selected, '')
  assert.equal(model.foreign, false)
})

test('projectOptionLabel：只给项目名，全路径退到 option 的 title（不把共同前缀铺进下拉框）', () => {
  assert.equal(
    projectOptionLabel({ path: '/home/me/Code/dsh-session-insight', title: 'dsh-session-insight' }),
    'dsh-session-insight',
  )
  assert.equal(projectOptionLabel({ path: '/home/me/note', title: '笔记' }), '笔记')
  // 没有标题时用路径末段兜底 —— 仍然是名字，不是整条路径
  assert.equal(projectOptionLabel({ path: '/home/me/Code/aurora-source' }), 'aurora-source')
  assert.equal(projectOptionLabel({}), '')
})
