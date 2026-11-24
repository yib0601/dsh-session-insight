// 主题分类（category）：把「这条记忆属于哪一方面」变成**可注入门控**的显式维度。
//
// 为什么需要它：`kind` 记的是记忆形态（lesson/decision/procedure/experience），与「风格偏好 /
// 架构偏好」是正交的两个轴。没有主题轴时，判定只有两条——作者写的 `when`（命中就全文注入）与
// 统计相近（BM25 + 覆盖率）。前者里只要写了一个万能 op（`file-write` / `shell-run` / `git-commit`），
// 任何一次写文件都会把条目全文顶进上下文；后者是相关性兜底，不区分方面。两者合起来就是体感上的
// 「聊什么都全注入」。
//
// 本模块只做三件事，且都是纯函数（无 IO、无 store、可单测）：
//  1. `TOPIC_SPECS`：受控主题表（主题键 + 人类可读标签 + 高区分度意图词）；
//  2. `detectTopics(text)`：把人类消息 / 写目标归到若干主题（本步"涉及哪方面"）；
//  3. `categoryIntents(c)` / `normalizeCategory(v)`：写入侧把 `category` 派生进 `trigger.when.intents`，
//     让「分类」直接长成既有唯一触发面——不新增注入通道，也不改 `matchTrigger` 语义。

/**
 * 受控主题键。顺序即「话题歧义时的优先级」：越靠前越具体。
 * 新增主题只需在此登记并补 `TOPIC_SPECS`，注入侧无需改动。
 */
export const TOPICS = ['style', 'arch', 'data', 'test', 'perf', 'security', 'deploy', 'docs', 'tooling']

/**
 * 主题表。`intents` 里的词会被同时用于两侧：
 *  - 写入侧：`category` 派生进 `trigger.when.intents`（分类即触发面）；
 *  - 读取侧：`detectTopics` 用它判断本步在聊哪一方面。
 * 词必须**高区分度**：宁可漏召回也不要「优化 / 配置 / 问题」这种到处出现的通用词——它们会让
 * 每个主题都命中，主题门控等于没有。
 */
export const TOPIC_SPECS = {
  style: {
    label: '风格/视觉',
    intents: ['风格', '样式', '视觉', '配色', '主题色', '排版', '字体', '间距', '圆角', '动效', '图标', '布局', '暗色', '亮色', 'css'],
  },
  arch: {
    label: '架构/边界',
    intents: ['架构', '模块边界', '分层', '依赖方向', '耦合', '内聚', '重构', '公开出口', '接线', '目录结构', '拆分'],
  },
  data: {
    label: '数据/存储',
    intents: ['数据模型', '存储', '持久化', '表结构', '字段', '索引', '缓存', '迁移', 'schema', '数据库'],
  },
  test: {
    label: '测试/回归',
    intents: ['测试', '单测', '回归', '用例', '覆盖率', '断言', '快照', 'e2e'],
  },
  perf: {
    label: '性能',
    intents: ['性能', '耗时', '延迟', '吞吐', '并发', '内存占用', '基准', 'profile'],
  },
  security: {
    label: '安全/权限',
    intents: ['安全', '鉴权', '权限', '认证', '密钥', '令牌', '越权', '脱敏', '注入漏洞'],
  },
  deploy: {
    label: '部署/发布',
    intents: ['部署', '发布', '上线', '打包', '构建', '镜像', '容器', '回滚', '发版'],
  },
  docs: {
    label: '文档/笔记',
    intents: ['文档', '笔记', '注释', '说明', 'readme', 'changelog'],
  },
  tooling: {
    label: '工具链/插件',
    intents: ['插件', '工具链', '脚本', '配置项', '设置页', '钩子', 'cli', '事件订阅'],
  },
}

/** 中文/别名 → 主题键（写入侧宽容，避免作者写「风格」就跟「style」分裂成两类）。 */
const CATEGORY_ALIASES = new Map([
  ['风格', 'style'], ['视觉', 'style'], ['样式', 'style'], ['ui', 'style'], ['design', 'style'], ['design-system', 'style'],
  ['架构', 'arch'], ['architecture', 'arch'],
  ['数据', 'data'], ['存储', 'data'], ['data-model', 'data'],
  ['测试', 'test'], ['testing', 'test'],
  ['性能', 'perf'], ['performance', 'perf'],
  ['安全', 'security'], ['权限', 'security'],
  ['部署', 'deploy'], ['发布', 'deploy'], ['release', 'deploy'], ['deployment', 'deploy'],
  ['文档', 'docs'], ['documentation', 'docs'],
  ['工具', 'tooling'], ['插件', 'tooling'], ['plugin', 'tooling'], ['tooling', 'tooling'],
])

/**
 * 归一 category：合法主题键、别名、或 null（不认识的丢弃——不受控的自由文本会让门控失效）。
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeCategory(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (TOPICS.includes(raw)) return raw
  return CATEGORY_ALIASES.get(raw) || CATEGORY_ALIASES.get(raw.replace(/[\s_]/g, '-')) || null
}

/** 主题标签（GUI/日志用）：未知主题回退成原值本身。 */
export function topicLabel(category) {
  const key = normalizeCategory(category)
  return key ? TOPIC_SPECS[key].label : String(category ?? '')
}

/** 该主题的派生意图词（写进 `trigger.when.intents`，受 `isIntentWord` 同一把尺子过滤）。 */
export function categoryIntents(category) {
  const key = normalizeCategory(category)
  return key ? [...TOPIC_SPECS[key].intents] : []
}

/**
 * 文本 → 本步涉及的主题（按命中词数降序，最多 `limit` 个）。
 * 输入应是「人类意图 + 写目标」的合并文本：只看人类消息会把「顺手改个样式」的路径线索漏掉，
 * 只看工具参数则会把 `style.css` 这种偶发路径当成在聊风格。
 * 没有任何命中时返回空数组——空数组的含义是「话题不明」，注入侧据此**不过滤**（宁松勿静默）。
 * @param {string|string[]} text
 * @param {{limit?: number}} [opts]
 * @returns {string[]}
 */
export function detectTopics(text, { limit = 3 } = {}) {
  const hay = (Array.isArray(text) ? text.join('\n') : String(text ?? '')).toLowerCase()
  if (!hay.trim()) return []
  const hits = []
  for (const key of TOPICS) {
    let n = 0
    for (const word of TOPIC_SPECS[key].intents) if (hay.includes(String(word).toLowerCase())) n++
    if (n) hits.push({ key, n })
  }
  hits.sort((a, b) => b.n - a.n || TOPICS.indexOf(a.key) - TOPICS.indexOf(b.key))
  return hits.slice(0, Math.max(0, limit)).map((h) => h.key)
}

/**
 * 条目所属主题：显式 `category` 优先；老条目没有就按标题+正文猜一次（只读，不改数据）。
 * 猜出来的值**不用于写入**，只让「还没分类的老条目」也能被主题门控看见。
 * @param {object} ins
 * @returns {string|null}
 */
export function topicOf(ins) {
  if (!ins || typeof ins !== 'object') return null
  const explicit = normalizeCategory(ins.category)
  if (explicit) return explicit
  const text = [ins.title, ins.pattern, ins.fix, ins.choice, ins.reason, ins.problem, ins.solution]
    .filter(Boolean).join('\n')
  const guess = detectTopics(text, { limit: 1 })
  return guess[0] || null
}

/**
 * 写入侧派生：`category` 存在时把它自己的意图词并进 `trigger.when.intents`（幂等、不改原对象）。
 * 目的只有一个——让「设了分类」等于「该方面的词一出现就注入」，无需作者再手写一遍 intents。
 * 注意它**不碰 ops/writes**：分类是主题面，不该凭空放宽动作面。
 * @param {object} ins
 * @returns {object} 新条目（无 category 时原样返回）
 */
export function withCategoryTrigger(ins) {
  const key = normalizeCategory(ins?.category)
  if (!key) return ins
  const trigger = ins.trigger && typeof ins.trigger === 'object' ? ins.trigger : {}
  const when = trigger.when && typeof trigger.when === 'object' ? trigger.when : {}
  const merged = [...new Set([...(when.intents || []), ...TOPIC_SPECS[key].intents])]
  return { ...ins, category: key, trigger: { ...trigger, when: { ...when, intents: merged } } }
}
