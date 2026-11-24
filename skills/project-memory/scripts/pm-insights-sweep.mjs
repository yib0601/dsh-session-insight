#!/usr/bin/env node
// 草稿清扫：把反思管线（config.reflection）产出的 task 级草稿 `draft:true` 审核并提升到 project 级。
//
//   node pm-insights-sweep.mjs [项目根] [--dry-run] [--json]
//                              [--memory-dir .dsh-project-memory]
//                              [--max-project 400] [--decay-days 365] [--min-confidence 0.7]
//
// 为什么需要这一步：反思产出一律 `draft: true` 且只落 task 层，`promoteAllTasksToProject`
// 也会显式跳过草稿（`ins.draft === true → continue`）—— 设计上要人拍一次板。没有这一步，
// 反思写得再多也不会进 project 级常驻注入，等于白跑。
//
// 动作等价于面板上逐个点「确认 + 提升」：走的是同一份 actInsight()，因此保留使用痕迹
// （hitCount / createdAt / prev / triggerDerived）、近重复合并、以及 maxProject 容量淘汰。
// 先在默认只读模式（--dry-run）看清单，再决定是否落盘。
import path from 'node:path'
import { ProjectMemoryStore } from '../../../src/memory/store.js'
import { memoryRootFor } from '../../../src/memory/util/fs.js'
import { GlobalStore, cfgInsight, defaultGlobalFile } from '../../../src/memory/insight-store.js'
import { actInsight } from '../../../src/memory/commands/insight-actions.js'

const args = process.argv.slice(2)
const json = args.includes('--json')
const dryRun = args.includes('--dry-run')

let memoryDir = process.env.DSH_PROJECT_MEMORY_DIR || '.dsh-project-memory'
let maxProject = 400
let decayDays = 365
let minConfidence = 0.7
const positional = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  const val = (name) => (a.startsWith(`${name}=`) ? a.slice(name.length + 1) : args[++i])
  if (a === '--json' || a === '--dry-run') continue
  if (a === '--memory-dir' || a.startsWith('--memory-dir=')) { memoryDir = val('--memory-dir') || memoryDir; continue }
  if (a === '--max-project' || a.startsWith('--max-project=')) { maxProject = Number(val('--max-project')) || maxProject; continue }
  if (a === '--decay-days' || a.startsWith('--decay-days=')) { decayDays = Number(val('--decay-days')) || decayDays; continue }
  if (a === '--min-confidence' || a.startsWith('--min-confidence=')) { minConfidence = Number(val('--min-confidence')) || minConfidence; continue }
  if (a.startsWith('--')) continue
  positional.push(a)
}
const root = path.resolve(positional[0] || process.cwd())

const store = new ProjectMemoryStore(memoryRootFor(root, memoryDir)).load()
const gs = new GlobalStore(defaultGlobalFile()).load()
const cfg = cfgInsight({ insight: { maxProject, decayDays, promoteConfidence: minConfidence } })

// 待审草稿：task 层、draft:true、未归档。project / global 层的 draft 不在此列（正常不会出现）。
const pending = []
for (const task of store.getTasks() || []) {
  for (const ins of task.insights || []) {
    if (!ins || ins.draft !== true || ins.archived) continue
    pending.push({ taskId: task.id, taskTitle: task.title || '', id: ins.id, kind: ins.kind || 'lesson', title: ins.title || '', confidence: typeof ins.confidence === 'number' ? ins.confidence : null })
  }
}

const out = { root, memoryDir: memoryDir, mode: dryRun ? 'dry-run' : 'apply', total: pending.length, swept: [], skipped: [] }

if (!pending.length) {
  out.message = '没有待审草稿'
} else if (dryRun) {
  out.swept = pending.map((p) => ({ ...p, actions: ['confirm', 'promote'] }))
} else {
  let ok = 0
  for (const p of pending) {
    const confirmed = actInsight({ store, gs, action: 'confirm', scope: 'task', id: p.id, taskId: p.taskId, cfg })
    if (!confirmed.ok) {
      out.skipped.push({ ...p, reason: confirmed.text })
      continue
    }
    const promoted = actInsight({ store, gs, action: 'promote', scope: 'task', id: p.id, taskId: p.taskId, cfg })
    if (!promoted.ok) {
      out.skipped.push({ ...p, reason: promoted.text })
      continue
    }
    ok++
    out.swept.push({ ...p, result: promoted.text })
  }
  // 落盘：actInsight 只改内存并 markDirty，提交由调用方负责（与命令 handler 同一约定）。
  store.commit(() => undefined)
  if (gs._dirty) gs.commit()
  out.written = ok
  out.storeSaveOk = store.lastSaveOk !== false
  out.lockPending = store.lastSaveOk === false
}

if (json) {
  console.log(JSON.stringify(out, null, 2))
} else {
  console.log(`项目根: ${out.root}（memoryDir=${out.memoryDir}，${out.mode}）`)
  if (!pending.length) console.log('没有待审草稿')
  else if (dryRun) {
    console.log(`待审草稿 ${pending.length} 条：`)
    for (const p of pending) console.log(`  - [${p.kind}] ${p.title} (task=${p.taskId}${p.confidence != null ? `, conf=${p.confidence}` : ''})`)
    console.log('加 --dry-run 之外的方式再跑一次即落盘（去掉 --dry-run）')
  } else {
    console.log(`已确认并提升 ${out.written} 条：`)
    for (const s of out.swept) console.log(`  - ${s.result}`)
    for (const s of out.skipped) console.log(`  ! 跳过 ${s.id}: ${s.reason}`)
    if (out.lockPending) console.log('! store 忙（另一进程正在写），本次未落盘，稍后重跑')
  }
}
process.exitCode = 0
