/**
 * 「笔记目录」选择通道的行为测试（client-memory-src/notes-directory.js）。
 *
 * 锁三件事：
 *   1. **能力探测是软的**：宿主没有 `uiWorkspace`、没有 `remote.directoryPicker`、
 *      甚至连 `ctx.get` 都没有时，`available()` 必须是 false 而不是抛错 ——
 *      设置页靠它决定"给选择器还是给手写框"，抛错就等于整页白屏。
 *   2. **两条通道二选一**：`uiWorkspace.listDirectory` 优先，`remote.directoryPicker`
 *      那条要把 `{ok,value}` 信封解开（解不开上层就会拿到 undefined）。
 *   3. **起始层只认绝对路径**：`~/note` 交给宿主 home，不能当绝对路径去列。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  capabilityRefused, crumbLabel, directoryAccess, initialDirectory,
} from '../client-memory-src/notes-directory.js'

const LISTING = { path: '/home/u/note', home: '/home/u', crumbs: [], entries: [], truncated: false }

test('没有任何目录服务时 available=false，list 以 reject 结束（不抛同步异常）', async () => {
  const access = directoryAccess({})
  assert.equal(access.available(), false)
  await assert.rejects(() => access.list('/tmp'), /no directory service/)
})

test('ctx.get 抛错也不影响探测（读被拒是正常形态）', () => {
  const ctx = {
    get(name) {
      if (name === 'uiWorkspace') throw new Error('cannot get property without inject')
      return undefined
    },
  }
  assert.equal(directoryAccess(ctx).available(), false)
})

test('uiWorkspace.listDirectory 优先，参数原样透传', async () => {
  const calls = []
  const ctx = {
    get: (name) => (name === 'uiWorkspace'
      ? { listDirectory: async (path, signal) => { calls.push({ path, signal }); return LISTING } }
      : undefined),
  }
  const access = directoryAccess(ctx)
  assert.equal(access.available(), true)
  const signal = new AbortController().signal
  assert.deepEqual(await access.list('/home/u/note', signal), LISTING)
  assert.deepEqual(calls, [{ path: '/home/u/note', signal }])
})

test('没有 uiWorkspace 时回退 remote.directoryPicker，并解开 {ok,value} 信封', async () => {
  const ctx = {
    get: (name) => (name === 'remote'
      ? { directoryPicker: { list: async () => ({ ok: true, value: LISTING }) } }
      : undefined),
  }
  const access = directoryAccess(ctx)
  assert.equal(access.available(), true)
  assert.deepEqual(await access.list(undefined), LISTING)
})

test('remote.directoryPicker 的业务失败要变成 reject（带宿主文案）', async () => {
  const ctx = {
    get: (name) => (name === 'remote'
      ? { directoryPicker: { list: async () => ({ ok: false, error: { message: 'directory-picker/unreadable' } }) } }
      : undefined),
  }
  await assert.rejects(() => directoryAccess(ctx).list('/nope'), /unreadable/)
})

test('属性回退路径（老宿主把服务挂在 ctx 上）也能探测到', () => {
  const ctx = { uiWorkspace: { listDirectory: async () => LISTING } }
  assert.equal(directoryAccess(ctx).available(), true)
})

test('起始层只认绝对路径：~/note 交给宿主 home', () => {
  assert.equal(initialDirectory('~/note'), undefined)
  assert.equal(initialDirectory(''), undefined)
  assert.equal(initialDirectory('   '), undefined)
  assert.equal(initialDirectory('/home/u/note'), '/home/u/note')
  assert.equal(initialDirectory('  /home/u/note  '), '/home/u/note')
})

test('面包屑标签：根路径没有名字时显示全路径', () => {
  assert.equal(crumbLabel({ name: '/', path: '/' }), '/')
  assert.equal(crumbLabel({ name: '', path: '/home/u' }), '/home/u')
  assert.equal(crumbLabel({ name: 'note', path: '/home/u/note' }), 'note')
  assert.equal(crumbLabel(undefined), '')
})

test('mode(): 只有 list 且能列成功 → browse', async () => {
  const ctx = {
    get: (name) => (name === 'uiWorkspace'
      ? {
        listDirectory: async () => LISTING,
        pickDirectory: async () => '/home/u/picked',
      }
      : undefined),
  }
  assert.equal(await directoryAccess(ctx).mode(), 'browse')
})

test('mode(): list 被 capability 拒掉、但有 pick → native（本机原生对话框）', async () => {
  const ctx = {
    get: (name) => (name === 'uiWorkspace'
      ? {
        listDirectory: async () => {
          throw new Error('directory browse failed: directory-picker/unavailable: directoryPicker.list needs the browse capability; the composed picker serves "native"')
        },
        pickDirectory: async () => '/home/u/picked',
      }
      : undefined),
  }
  const access = directoryAccess(ctx)
  assert.equal(await access.mode(), 'native')
  assert.equal(await access.pick(), '/home/u/picked')
  // 结论按会话缓存：第二次不再打那一次探测用的失败 RPC
  let calls = 0
  const counting = {
    get: (name) => (name === 'uiWorkspace'
      ? {
        listDirectory: async () => { calls += 1; throw new Error('directory-picker/unavailable: nope') },
        pickDirectory: async () => '/x',
      }
      : undefined),
  }
  const cached = directoryAccess(counting)
  assert.equal(await cached.mode(), 'native')
  assert.equal(await cached.mode(), 'native')
  assert.equal(calls, 1)
})

test('mode(): list 因路径问题失败（不是能力问题）→ 仍然走内嵌浏览器，让用户看到那条错误', async () => {
  const ctx = {
    get: (name) => (name === 'uiWorkspace'
      ? {
        listDirectory: async () => { throw new Error('directory-picker/unreadable: /nope') },
        pickDirectory: async () => '/home/u/picked',
      }
      : undefined),
  }
  assert.equal(await directoryAccess(ctx).mode(), 'browse')
})

test('mode(): 没有任何动词 → none', async () => {
  assert.equal(await directoryAccess({}).mode(), 'none')
})

test('capabilityRefused 只认宿主的固定措辞', () => {
  assert.equal(capabilityRefused(new Error('directory-picker/unavailable: x')), true)
  assert.equal(capabilityRefused(new Error('needs the native capability')), true)
  assert.equal(capabilityRefused(new Error('directory-picker/unreadable: /nope')), false)
  assert.equal(capabilityRefused(undefined), false)
})
