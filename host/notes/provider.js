/**
 * 笔记检索的常驻桥（Node 侧）。
 *
 * 为什么是「常驻子进程 + 行分隔 JSON」而不是每次起一个 CLI
 * ──────────────────────────────────────────────────────
 * 语义检索要加载 onnx 模型（实测 RSS ~1GB、首发 1-6s）。每次查询新起进程就等于每次
 * 重付这笔成本；`emb_server.py` 的文档注释也把这一点写成了设计动机。所以这里拉一个
 * 常驻的 `bridge.py`，模型/索引/emb_server 只在第一次查询时付一次，之后 200-400ms。
 *
 * 为什么模型放在 Python 侧而不是移植到 JS
 * ──────────────────────────────────────
 * 检索内核（section 级 BM25F + 带幅度 RRF 融合 + 别名加权 + 相关性策略）是 ~1500 行
 * 有实测调参的 Python，字面移植只会引入漂移。这里的定位是**桥**，不是重写：
 * 一条 JSON 进、一条 JSON 出，检索语义永远和 CLI / MCP 同一份实现。
 *
 * 失败语义
 * ────────
 * 笔记检索是**可选能力**：Python 缺失、venv 没建、仓库不存在时，`search_notes` 工具
 * 如实报错，绝不静默返回空结果（空结果与"没装好"在模型眼里长得一样，会导致它反复换词
 * 空转）。进程崩溃按指数退避重启；正在飞的请求全部以明确错误结束，不挂起。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** `bridge.py` 与本文件同目录（npm files 白名单收录整个 host/）。 */
export const BRIDGE_SCRIPT = path.join(HERE, 'bridge.py')

/**
 * 选解释器：优先仓库自带 venv（语义层依赖 fastembed 只装在那里），
 * 退到 `python3`（纯词面可用）。两者都没有时由 spawn 的 error 事件如实上报。
 */
export function resolvePython(pythonPath, repo) {
  if (pythonPath) return pythonPath
  const venv = path.join(repo, '.notes/venv/bin/python')
  if (existsSync(venv)) return venv
  return 'python3'
}

/**
 * 读一个 config 字段的**当前值**。
 *
 * `enabled` / `repo` / `timeoutMs` 在 Config 里标了 `.volatile()`（设置页要能原地改），
 * 宿主把它们注入成 `{ get() }` ref；同一个 `notes` 对象上 `python` / `warmup` 仍是普通值。
 * 直接判真会把 ref 对象当成"永远有值"，所以每个读取点都过这个函数。
 */
function live(value) {
  return value && typeof value.get === 'function' ? value.get() : value
}

/** 只做形状校验，不猜默认值：`enabled`/`repo` 由 config 提供。 */
export function notesSettings(config) {
  const c = live(config && config.notes) || {}
  const repoField = live(c.repo)
  const raw = typeof repoField === 'string' && repoField.trim() ? repoField.trim() : ''
  // 配置里写 `~/note` 是自然的（profile yml 满屏都是这种写法），但 Node 与 Python 都不会
  // 替我们展开波浪号：dev 端口 `existsSync('~/note/.notes/venv/bin/python')` 恒为 false，
  // 于是静默退到系统 python3、语义层消失（表现是 mode=degraded，很容易被当成"笔记里没有"）。
  // 在唯一的入口处展开一次，下游一律用绝对路径。
  const repo = raw ? path.resolve(raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : raw) : ''
  const enabled = live(c.enabled)
  const timeoutMs = live(c.timeoutMs)
  const python = live(c.python)
  const warmup = live(c.warmup)
  return {
    enabled: enabled !== false && repo !== '',
    repo,
    python: typeof python === 'string' ? python : '',
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000,
    warmup: warmup !== false,
  }
}

/**
 * 决定"要不要把常驻桥重启"的指纹。
 *
 * 设置页改目录后要换进程，但**不能**每次 volatile 更新都重启 —— 宿主对整份 Config 的
 * 任意 volatile 字段都会发 `loader/volatile-update`（同一个 bundle 上还有 watchInterval、
 * autoIndexOnFirstUse…）。早停一个 1GB 的 python 再拉起来是几十秒的代价，所以只在
 * 这几个字段真的变了才重建。
 */
export function bridgeKey(settings) {
  return JSON.stringify([settings.enabled, settings.repo, settings.python, settings.timeoutMs])
}

export class NotesBridge {
  constructor(settings) {
    this.settings = settings
    this.child = null
    this.buffer = ''
    this.pending = new Map()
    this.nextId = 1
    this.ready = null
    this.disposed = false
    this.failures = 0
    this.restartTimer = null
    /** 最近一次整体失败的原因（供工具如实回报）。 */
    this.lastError = null
  }

  /** 惰性启动：第一次调用才拉进程，避免没用笔记能力的人白付 ~1GB。 */
  ensureStarted() {
    if (this.disposed) return Promise.reject(new Error('notes bridge disposed'))
    if (this.ready !== null) return this.ready
    // 崩溃退避：连续失败时不要每条查询都重拉一个 python（会变成打嗝循环）。
    const now = Date.now()
    if (now < (this.restartAfter ?? 0)) {
      return Promise.reject(new Error(this.lastError || 'notes bridge restarting'))
    }
    const python = resolvePython(this.settings.python, this.settings.repo)
    const child = spawn(python, [BRIDGE_SCRIPT, '--repo', this.settings.repo], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })
    this.child = child

    this.ready = new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn, value) => {
        if (settled) return
        settled = true
        fn(value)
      }

      // ready 的语义是"进程已拉起、可以发请求"，不是"已经答过一条"。
      // 早期版本用"收到第一条响应"settle ready，而 request() 是 `await ensureStarted()`
      // 之后才写 stdin 的 —— 于是谁都不先动，首次调用直接死锁。
      child.once('spawn', () => settle(resolve, true))

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk
        let idx
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, idx).trim()
          this.buffer = this.buffer.slice(idx + 1)
          if (!line) continue
          let msg
          try {
            msg = JSON.parse(line)
          } catch {
            continue // 非 JSON 的 stdout 噪声（警告）直接丢弃
          }
          this._dispatch(msg, settle, resolve, reject)
        }
      })

      // stderr 只做诊断：bridge 的 traceback 会打在这里，不能让它污染协议流。
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => {
        const text = String(chunk).trim()
        if (text) console.error(`[notes-bridge] ${text.split('\n').slice(-3).join(' | ')}`)
      })

      child.on('error', (error) => {
        this.lastError = `notes bridge failed to start: ${error.message}`
        settle(reject, new Error(this.lastError))
        this._teardown()
      })

      child.on('exit', (code, signal) => {
        const reason = `notes bridge exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`
        if (!this.disposed) console.error(`[notes-bridge] ${reason}`)
        // 启动阶段就退出：多半是 python/仓库路径错，如实回报而不是让首次调用挂死。
        settle(reject, new Error(this.lastError || reason))
        this._teardown()
      })
    })

    if (this.settings.warmup) {
      // 预热：先 ping 确认进程活着；真正的模型加载留给第一次 search（bridge 里按需）。
      this.ready
        .then(() => this.request({ op: 'ping' }, 10000))
        .catch(() => {})
    }
    return this.ready
  }

  _dispatch(msg, settle, resolve, reject) {
    if (msg.id !== undefined && msg.id !== null) {
      const waiter = this.pending.get(msg.id)
      if (waiter) {
        this.pending.delete(msg.id)
        clearTimeout(waiter.timer)
        waiter.resolve(msg)
        return
      }
    }
    // 没有对应 waiter 的消息只可能是 bridge 的启动期错误（`_fail()` 不带 id）。
    if (msg.ok === false) {
      this.lastError = msg.error || 'notes bridge rejected startup'
      // 必须打出来：`bridge.py` 的 `_fail()` 写的是 **stdout**（不是 stderr），而这里若不
      // 转述，宿主日志里就只剩一行 `notes bridge exited (code=1)` —— 真正的原因
      // （如 "not a notes repo (no .notes/): ~/note"）完全丢失，排查只能靠手工复现。
      console.error(`[notes-bridge] startup rejected: ${this.lastError}`)
      settle(reject, new Error(this.lastError))
      return
    }
    // 正常响应但 waiter 已超时：只顺带把 ready 标记为已就绪。
    if (this.pending.size === 0) {
      this.failures = 0
      settle(resolve, true)
    }
  }

  _teardown() {
    this.ready = null
    const child = this.child
    this.child = null
    this.buffer = ''
    // 崩溃退避：1s、2s、4s… 上限 30s。成功响应会把 failures 归零（见 _dispatch）。
    this.failures = (this.failures || 0) + 1
    if (this.failures > 1) {
      this.restartAfter = Date.now() + Math.min(30000, 1000 * 2 ** (this.failures - 2))
    }
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(this.lastError || 'notes bridge stopped'))
    }
    this.pending.clear()
    if (child && !child.killed) {
      try {
        child.stdin.end()
      } catch {
        /* 已死 */
      }
    }
  }

  /** 发一条请求并等它的响应；超时/进程死亡都以拒绝结束，不挂起调用方。 */
  async request(payload, timeoutMs) {
    await this.ensureStarted()
    const child = this.child
    if (!child || child.killed) throw new Error(this.lastError || 'notes bridge unavailable')
    const id = this.nextId++
    const message = JSON.stringify({ ...payload, id }) + '\n'
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`notes bridge timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        child.stdin.write(message)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  /** 检索。返回 `{mode, semantic, relevance, results}`；失败抛错（调用方如实回报）。 */
  async search({ query, limit, tags, dir, expOnly, noContext }) {
    const response = await this.request({
      op: 'search',
      query,
      limit,
      tags,
      dir,
      exp_only: expOnly === true,
      no_context: noContext === true,
    }, this.settings.timeoutMs)
    if (response.ok === false) throw new Error(response.error || 'notes search failed')
    return {
      mode: response.mode,
      semantic: response.semantic,
      relevance: response.relevance,
      error: response.error,
      results: Array.isArray(response.results) ? response.results : [],
    }
  }

  async dispose() {
    this.disposed = true
    const child = this.child
    if (!child || child.killed) return
    try {
      child.stdin.write(JSON.stringify({ op: 'quit' }) + '\n')
    } catch {
      /* 已死 */
    }
    // 1.5s 内没自己退就强杀；emb_server 是它的子进程，会随之退出。
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* 已死 */
        }
        resolve()
      }, 1500)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
