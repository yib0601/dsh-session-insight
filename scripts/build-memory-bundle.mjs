#!/usr/bin/env node
/**
 * 把 client-memory-src/ 下的手写 ESM 模块装配进 client.memory.js。
 *
 * 为什么不用打包器：这些模块全是手写 createElement、无 JSX，依赖只有 react 与宿主
 * ui-primitives。用几十行机械转换比引入 rolldown/vite 更可控，也避免再多一条构建链。
 *
 * 为什么是"原地替换模块表"而不是整份重写：`client.memory.js` 的头尾是手写装配代码
 * （__ModuleLoader__ 注册、require 桥、`return __require('client-memory-src/client.js')`），
 * 只有中间那张 `__modules[...] = function (__exports, __req) {…}` 表是生成的。脚本只重写
 * 这张表，头尾一字不动 —— 于是"手写部分"和"生成部分"的边界在 diff 里始终可见。
 *
 * 用法：node scripts/build-memory-bundle.mjs
 *
 * 转换规则（只处理本目录里实际出现的形态）：
 *   import { a, b as c } from './x.js'   → const { a, b: c } = __req('x.js')
 *   import * as ns from '@pkg'           → const ns = __req('@pkg')
 *   import defaultName from './x.js'     → const defaultName = __req('./x.js').default
 *   export function foo                  → function foo;  __exports.foo = foo
 *   export const/class Name              → const/class Name;  __exports.Name = Name
 *
 * 生成后必须把**入口文件**的 mtime 也动一下（脚本末尾自动做）。
 *
 * 宿主给每个 bundle 行的 `rev` 取的是**入口工件**（`client.js`）的 mtime/ctime/size 指纹，
 * 页面的 chunk 请求形如 `/plugins/@local/dsh-session-insight/client.memory.js?rev=<入口 rev>`，
 * 服务端按这个 rev 缓存响应体。只写 chunk、不碰入口，rev 不变 → 页面继续拿旧字节，
 * 表现是"改了代码但界面没变化"，很容易被误判成构建失败。这是实测结论，不是猜测。
 */
import { readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'client-memory-src')
const OUT = path.join(ROOT, 'client.memory.js')
const TABLE_HEAD = 'function __registerMemoryModules(__modules) {'

/** 源码 → factory 体 + 导出赋值。 */
function convert(code) {
  const exported = new Set()
  let body = code

  body = body.replace(
    /^import\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\}|(\w+))\s*(?:,\s*\{([^}]*)\})?\s*from\s+['"]([^'"]+)['"];?\s*$/gm,
    (match, star, named, dflt, named2, spec) => {
      const target = `__req(${JSON.stringify(spec)})`
      const parts = []
      if (star) parts.push(`const ${star} = ${target};`)
      if (dflt) parts.push(`const ${dflt} = ${target}.default ?? ${target};`)
      const names = [named, named2].filter(Boolean).join(',')
      if (names.trim()) {
        const mapped = names.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
          const asMatch = item.match(/^(\w+)\s+as\s+(\w+)$/)
          return asMatch ? `${asMatch[1]}: ${asMatch[2]}` : item
        }).join(', ')
        parts.push(`const { ${mapped} } = ${target};`)
      }
      return parts.join(' ')
    },
  )

  body = body.replace(/^export\s+(async\s+)?function\s+(\w+)/gm, (match, asyncKw, name) => {
    exported.add(name)
    return `${asyncKw || ''}function ${name}`
  })
  body = body.replace(/^export\s+class\s+(\w+)/gm, (match, name) => {
    exported.add(name)
    return `class ${name}`
  })
  body = body.replace(/^export\s+(const|let|var)\s+(\w+)/gm, (match, kw, name) => {
    exported.add(name)
    return `${kw} ${name}`
  })
  body = body.replace(/^export\s+default\s+/gm, 'const __default = ')
  body = body.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (match, names) => {
    names.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => {
      const asMatch = item.match(/^(\w+)\s+as\s+(\w+)$/)
      exported.add(asMatch ? `${asMatch[2]}=${asMatch[1]}` : item)
    })
    return ''
  })

  const assigns = [...exported].map((name) => {
    const pair = name.split('=')
    return pair.length === 2 ? `__exports.${pair[0]} = ${pair[1]};` : `__exports.${name} = ${name};`
  })
  if (/^const __default = /m.test(body)) assigns.push('__exports.default = __default;')

  return { body, assigns }
}

/**
 * 模块表的结束位置由**页脚锚点**决定，不数括号。
 *
 * 数括号这条路走过一次并且错了：模块源码里有模板字符串（`${…}`）、正则和注释里的
 * 花括号，文本层面的深度永远对不回 0，结果"替换表体"实际替换到了文件末尾，手写页脚
 * （`const __require = …` / `__registerMemoryModules(__modules)` / `return __require(…)`）
 * 被整段吃掉，而 `node --check` 依然报错在最后一行才暴露。页脚是手写的、稳定的，
 * 用它当边界既准确又不用理解 JS。
 */
const TABLE_FOOT = '\n    const __require = '

const files = readdirSync(SRC).filter((file) => file.endsWith('.js')).sort()
const entries = files.map((file) => {
  const { body, assigns } = convert(readFileSync(path.join(SRC, file), 'utf8'))
  return `    __modules[${JSON.stringify(`client-memory-src/${file}`)}] = function (__exports, __req) {\n`
    + body.trimEnd() + '\n'
    + (assigns.length ? assigns.map((line) => `    ${line}`).join('\n') + '\n' : '')
    + '    };'
})

const source = readFileSync(OUT, 'utf8')
const head = source.indexOf(TABLE_HEAD)
if (head < 0) throw new Error(`client.memory.js: "${TABLE_HEAD}" not found`)
const foot = source.indexOf(TABLE_FOOT, head)
if (foot < 0) throw new Error(`client.memory.js: footer anchor ${JSON.stringify(TABLE_FOOT.trim())} not found`)
const open = source.indexOf('{', head)
const banner = `    /**
     * 自动生成的模块表 —— 由 scripts/build-memory-bundle.mjs 从 client-memory-src/ 转换而来。
     * 不要手改：改源码后重跑 \`node scripts/build-memory-bundle.mjs\`。
     *
     * 每个条目是一个 factory(__exports, __req)，import 已转成 __req、export 已转成赋值。
     */`
const table = `\n${banner}\n${entries.join('\n\n')}\n}\n`
const next = source.slice(0, open + 1) + table + source.slice(foot)
writeFileSync(OUT, next)

// 入口工件的 mtime/ctime/size 是宿主给这一行 bundle 的 rev 来源（见文件头注释）：
// 只改 chunk 不动入口，页面会一直拿到按旧 rev 缓存的字节。这里显式 touch 一次，
// 让 HMR 的下一次 stat 轮询就能发 `rebuilt` 帧。
const now = new Date()
for (const entry of ['client.js', 'client.memory.js']) {
  try {
    utimesSync(path.join(ROOT, entry), now, now)
  } catch {
    // 入口文件不在（只跑生成脚本的裁剪包）时不必失败：chunk 已经写好了。
  }
}

console.log(`client.memory.js ← ${files.length} 个模块`)
console.log(files.map((file) => `  ${file}`).join('\n'))
