#!/usr/bin/env node
// 给现有记忆补主题分类（`category`），把「按 when 全注入」的历史条目收进主题门控。
//
// 为什么单独一个脚本：分类是**数据**决定，不是代码能猜的。这里只做机械建议——按标题/正文里的
// 主题词给出候选主题；是否落盘由 `--write` 明确要求，默认 dry-run 只打印一张表。
//
// 用法：
//   node scripts/backfill-category.mjs                # 当前目录，dry-run
//   node scripts/backfill-category.mjs /p/a /p/b      # 多个项目根
//   node scripts/backfill-category.mjs --write        # 落盘（写 category 并派生 when.intents）
//   node scripts/backfill-category.mjs --force        # 连已有 category 的一起重评
//
// 落盘走 ProjectMemoryStore（与插件同一套归一/分片/原子写），不手改 JSON。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..', 'src', 'memory')
const { ProjectMemoryStore } = await import(path.join(SRC, 'store.js'))
const { TOPIC_SPECS, normalizeCategory, detectTopics, topicLabel, withCategoryTrigger } = await import(path.join(SRC, 'topic.js'))

/** 命中了哪些主题词：只用来解释建议，不参与判定（判定仍靠 topic.js 的 detectTopics）。 */
function evidence(text, key) {
  const hay = String(text || '').toLowerCase()
  return (TOPIC_SPECS[key]?.intents || []).filter((w) => hay.includes(String(w).toLowerCase()))
}

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const force = argv.includes('--force')
const roots = argv.filter((a) => !a.startsWith('--'))
if (!roots.length) roots.push(process.cwd())

let total = 0
let suggested = 0
let changed = 0

for (const rootInput of roots) {
  const root = path.resolve(rootInput)
  const memoryRoot = path.join(root, '.dsh-project-memory')
  const store = new ProjectMemoryStore(memoryRoot).load()
  const items = store.insightItems() || []
  if (!items.length) {
    console.log(`\n${root}\n  (无记忆条目)`)
    continue
  }
  console.log(`\n${root}`)
  let touched = false
  for (const it of items) {
    total++
    if (it.archived || it.draft) continue
    const existing = normalizeCategory(it.category)
    if (existing && !force) continue
    const text = [it.title, it.pattern, it.fix, it.choice, it.reason, it.problem, it.solution, it.body]
      .filter(Boolean).join('\n')
    const guess = detectTopics(text, { limit: 1 })[0] || null
    const shown = `${String(it.id).slice(0, 18)}… ${it.kind.padEnd(10)} ${String(it.title || '').slice(0, 42)}`
    if (!guess) {
      console.log(`  - 跳过   ${shown}   （正文里没有可判定的主题词，保持未分类）`)
      continue
    }
    suggested++
    const why = evidence(text, guess).slice(0, 3).join('/') || '?'
    console.log(`  · ${existing ? '改' : '补'} → ${topicLabel(guess).padEnd(8)} [${why}] ${shown}`)
    if (write) {
      it.category = guess
      const merged = withCategoryTrigger(it)
      it.trigger = merged.trigger
      touched = true
      changed++
    }
  }
  if (touched) {
    store.replaceInsightItems(items)
    store.save()
    console.log('  已落盘')
  }
}

console.log(`\n条目 ${total} 条，给出主题建议 ${suggested} 条${write ? `，已写入 ${changed} 条` : '（dry-run，加 --write 才落盘）'}`)
