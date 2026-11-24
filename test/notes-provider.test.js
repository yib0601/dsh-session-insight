/**
 * notes 配置解析的回归测试。
 *
 * 锁的是 2026-11-23 踩到的那个静默故障：profile 里写 `repo: ~/note`，而 Node 不展开
 * 波浪号 → `existsSync('~/note/.notes/venv/bin/python')` 恒 false → 静默退到系统 python3
 * → 语义层消失（工具照常返回结果，只是 mode=degraded）。这类"能跑但变差"的退化最难发现，
 * 所以把解析规则钉成测试。
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { NotesBridge, bridgeKey, notesSettings, resolvePython } from '../host/notes/provider.js'

// ---- 波浪号必须展开成绝对路径 ----
{
  const s = notesSettings({ notes: { repo: '~/note' } })
  assert.equal(s.repo, path.join(os.homedir(), 'note'), 'tilde must expand to an absolute path')
  assert.equal(s.enabled, true)
}

// ---- 相对路径也要绝对化：下游 spawn 的 cwd 不一定是会话 cwd ----
{
  const s = notesSettings({ notes: { repo: 'sub/notes' } })
  assert.ok(path.isAbsolute(s.repo), 'repo must be absolute')
}

// ---- 空 repo = 不启用（不该白拉一个 ~1GB 的 python 进程）----
{
  assert.equal(notesSettings({ notes: {} }).enabled, false)
  assert.equal(notesSettings({ notes: { repo: '   ' } }).enabled, false)
  assert.equal(notesSettings({}).enabled, false, 'missing notes section must not enable it')
}

// ---- 显式 enabled:false 优先级最高 ----
{
  assert.equal(notesSettings({ notes: { enabled: false, repo: '~/note' } }).enabled, false)
}

// ---- 解释器：显式 > venv > python3 ----
{
  const repo = path.join(os.homedir(), 'note')
  assert.equal(resolvePython('/custom/python', repo), '/custom/python', 'explicit wins')
  // 仓库里没有 venv 时退回 python3；有 venv 时用 venv（本机 ~/note 有，故按存在性断言）
  const resolved = resolvePython('', repo)
  assert.ok(
    resolved === 'python3' || resolved.endsWith(path.join('.notes', 'venv', 'bin', 'python')),
    `unexpected interpreter: ${resolved}`,
  )
}

// ---- 超时与预热有确定的默认值（避免 undefined 传进 setTimeout）----
{
  const s = notesSettings({ notes: { repo: '~/note' } })
  assert.equal(s.timeoutMs, 30000)
  assert.equal(s.warmup, true)
  assert.equal(notesSettings({ notes: { repo: '~/note', warmup: false } }).warmup, false)
}


// ---- volatile ref 形状：设置页改的是 ref，读取点必须解包 ----
// 宿主把标了 `.volatile()` 的字段注入成 `{get()}`；同一个 notes 对象上 python/warmup 仍是普通值。
// 这里手工造出混排形态，锁住"ref 与值同处一对象"时 notesSettings 仍然读对。
{
  const config = {
    notes: {
      enabled: { get: () => true },
      repo: { get: () => '~/note' },
      timeoutMs: { get: () => 45000 },
      python: '',
      warmup: false,
    },
  }
  const s = notesSettings(config)
  assert.equal(s.repo, path.join(os.homedir(), 'note'), 'ref 里的 repo 也要展开波浪号')
  assert.equal(s.enabled, true)
  assert.equal(s.timeoutMs, 45000)
  assert.equal(s.warmup, false)
  assert.equal(notesSettings({ notes: { repo: { get: () => '' } } }).enabled, false)
}

// ---- 换桥指纹：只有目录/开关/超时/解释器变了才重建常驻进程 ----
{
  const base = notesSettings({ notes: { repo: '~/note' } })
  const same = notesSettings({ notes: { repo: '~/note' } })
  assert.equal(bridgeKey(base), bridgeKey(same), '值没变就不该重启 1GB 的 python')
  assert.notEqual(bridgeKey(base), bridgeKey(notesSettings({ notes: { repo: '~/note2' } })))
  assert.notEqual(bridgeKey(base), bridgeKey(notesSettings({ notes: { repo: '~/note', timeoutMs: 1000 } })))
  assert.notEqual(bridgeKey(base), bridgeKey(notesSettings({ notes: { repo: '~/note', python: '/usr/bin/python3' } })))
  assert.notEqual(bridgeKey(base), bridgeKey(notesSettings({ notes: { repo: '~/note', enabled: false } })))
}

// ---- Config 契约：这三个字段必须标 volatile，否则设置页写嵌套路径会被宿主拒 ----
// 宿主的写入口用 isVolatilePath 校验"路径的最近 volatile 祖先"；漏标一个字段的后果是
// 卡片能填、能点保存，然后 400 —— 界面看不出问题，日志里只有一句"没有接受这些值"。
{
  const { Config } = await import('../src/memory/index.js')
  const notes = Config.dict.notes.dict
  for (const field of ['repo', 'enabled', 'timeoutMs']) {
    assert.equal(notes[field].meta?.volatile, true, `${field} must be volatile for the settings card`)
  }
  for (const field of ['python', 'warmup']) {
    assert.notEqual(notes[field].meta?.volatile, true, `${field} stays profile-only`)
  }
}

console.log('notes-provider.test.js: all assertions passed')
