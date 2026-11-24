/**
 * 「记忆规模」表单的行为测试（client-memory-src/memory-settings.js）。
 *
 * 锁四件事：
 *   1. **嵌套路径**：ops 的 path 必须是数组（`['insight','maxProject']`）。宿主对单段字符串
 *      路径会按 `isVolatilePath` 判成"不是 volatile"直接 400，而这类错误只在真实宿主上才炸。
 *   2. **范围校验**：越界/非整数挡在保存之外，且不产出 op（容量写成 0 会清空整层记忆）。
 *   3. **volatile ref**：值可能以 `{get()}` 到达，表单必须读出数字而不是把对象当文本。
 *   4. 草稿语义：空文本 = unset（回到 Config 默认），保存成功后草稿清空、失败则保留。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUDGET_CHARS_PER_TOKEN, MEMORY_SCALE_FIELDS, MEMORY_SCALE_LIMITS, MEMORY_SCALE_WIDGET, MemoryScaleForm,
} from '../client-memory-src/memory-settings.js'

/** 假的 configForms scope：形状照宿主 ConfigFormController（getSnapshot/subscribe/mutate）。 */
function fakeScope({ value = {}, user = {}, writable = true, status = 'ready', mutateOk = true } = {}) {
  const listeners = new Set()
  const calls = []
  const snapshot = {
    status,
    writable,
    value: {
      insight: { maxProject: 100, maxGlobalProcedures: 200, ...value.insight },
      autoContext: { maxTokens: 400, entryMaxInsights: 6, maxItemsPerSession: 60, maxItemCharsPerSession: 24000, ...value.autoContext },
    },
    base: {},
    user: { insight: { ...user.insight }, autoContext: { ...user.autoContext } },
    revision: 11,
  }
  return {
    calls,
    getSnapshot: () => snapshot,
    mutate: async (ops, revision) => { calls.push({ ops, revision }); return mutateOk },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

test('字段顺序稳定：容量 → 预算 → 保险丝', () => {
  assert.deepEqual(MEMORY_SCALE_FIELDS, [
    'maxProject',
    'maxGlobalProcedures',
    'maxTokens',
    'entryMaxInsights',
    'maxItemsPerSession',
    'maxItemCharsPerSession',
  ])
})

test('项目层容量走嵌套路径写入，revision 取自打开表单时的快照', async () => {
  const scope = fakeScope()
  const form = new MemoryScaleForm(scope)
  assert.equal(form.field('maxProject').text, '100')
  form.stage('maxProject', '250')
  assert.equal(form.shell().dirty, true)
  await form.save()
  assert.equal(scope.calls.length, 1)
  assert.deepEqual(scope.calls[0].ops, [
    { op: 'set', path: ['insight', 'maxProject'], value: 250 },
  ])
  assert.equal(scope.calls[0].revision, 11)
})

test('注入预算与保险丝各走自己的子对象', async () => {
  const scope = fakeScope()
  const form = new MemoryScaleForm(scope)
  // 预算在界面上是字符，写回配置要折成 token（1800 字符 → 600 token）
  form.stage('maxTokens', '1800')
  form.stage('maxItemsPerSession', '80')
  await form.save()
  const ops = scope.calls[0].ops
  assert.deepEqual(ops, [
    { op: 'set', path: ['autoContext', 'maxTokens'], value: 600 },
    { op: 'set', path: ['autoContext', 'maxItemsPerSession'], value: 80 },
  ])
})

test('注入预算：界面字符与配置 token 的换算（读 ×3、写 ÷3、取整到 3 的倍数）', async () => {
  const scope = fakeScope()
  const form = new MemoryScaleForm(scope)
  // 读：配置 400 token → 输入框 1200 字符（引擎 stepBudget = maxTokens × 3）
  assert.equal(form.field('maxTokens').text, String(400 * BUDGET_CHARS_PER_TOKEN))
  // 写：1000 字符不是 3 的倍数 → 333 token
  form.stage('maxTokens', '1000')
  assert.equal(form.field('maxTokens').text, '1000', '草稿原样显示，不提前改写用户输入')
  await form.save()
  assert.deepEqual(scope.calls[0].ops, [
    { op: 'set', path: ['autoContext', 'maxTokens'], value: 333 },
  ])
  // 存下的 333 token 再读回来是 999 字符 —— 输入 1000 被就近折掉 1 个字符
  const echo = new MemoryScaleForm(fakeScope({ value: { autoContext: { maxTokens: 333 } } }))
  assert.equal(echo.field('maxTokens').text, '999')
  // 校验在 token 域：150 字符 = 50 token 是下限，149 字符会被四舍五入到下限内侧而不是判非法
  const strict = new MemoryScaleForm(fakeScope())
  strict.stage('maxTokens', '100')
  assert.equal(strict.field('maxTokens').invalid, true)
  strict.stage('maxTokens', '999999')
  assert.equal(strict.field('maxTokens').invalid, true)
})

test('空文本 = unset（回到 Config 默认），不是写 0', async () => {
  const scope = fakeScope({ user: { insight: { maxProject: 250 } } })
  const form = new MemoryScaleForm(scope)
  form.stage('maxProject', '   ')
  await form.save()
  assert.deepEqual(scope.calls[0].ops, [{ op: 'unset', path: ['insight', 'maxProject'] }])
})

test('越界与非法值挡在保存之外', () => {
  const scope = fakeScope()
  const form = new MemoryScaleForm(scope)
  // 0 会让写入侧每次 prune 都清空项目层；负数、超过上限、非数字一律判非法。
  for (const bad of ['0', '-5', '999999', 'abc', 'NaN']) {
    form.stage('maxProject', bad)
    assert.equal(form.field('maxProject').invalid, true, `${bad} 应判非法`)
    assert.equal(form.shell().invalid, true)
    assert.deepEqual(form.plan(), [])
  }
})

test('小数四舍五入成整数（宿主容量是整数字段）', async () => {
  const scope = fakeScope()
  const form = new MemoryScaleForm(scope)
  form.stage('entryMaxInsights', '7.6')
  await form.save()
  assert.deepEqual(scope.calls[0].ops, [
    { op: 'set', path: ['autoContext', 'entryMaxInsights'], value: 8 },
  ])
})

test('值与生效值相同时不算 dirty', () => {
  const scope = fakeScope()
  const form = new MemoryScaleForm(scope)
  form.stage('maxTokens', '1200')
  assert.equal(form.shell().dirty, false)
  assert.deepEqual(form.plan(), [])
})

test('volatile ref 形状（{get()}）也能读出当前值', () => {
  const scope = fakeScope({
    value: { insight: { maxProject: { get: () => 180 } }, autoContext: { maxTokens: { get: () => 500 } } },
  })
  const form = new MemoryScaleForm(scope)
  assert.equal(form.field('maxProject').text, '180')
  assert.equal(form.field('maxTokens').text, '1500')
})

test('宿主拒绝保存时草稿保留（不吞掉用户输入）', async () => {
  const scope = fakeScope({ mutateOk: false })
  const form = new MemoryScaleForm(scope)
  form.stage('maxGlobalProcedures', '300')
  await form.save()
  assert.equal(form.shell().failed, true)
  assert.equal(form.field('maxGlobalProcedures').text, '300')
  assert.equal(form.shell().dirty, true)
})

test('命名空间不可用时 shell.available 为 false，仍可渲染空值', () => {
  const scope = fakeScope({ status: 'unavailable' })
  const form = new MemoryScaleForm(scope)
  assert.equal(form.shell().available, false)
  assert.equal(form.field('maxProject').text, '100')
})

test('每个字段的区间与单位都在 limits 表里（校验读它）', () => {
  for (const field of MEMORY_SCALE_FIELDS) {
    const limit = MEMORY_SCALE_LIMITS[field]
    assert.ok(limit, `${field} 缺 limits`)
    assert.ok(limit.min >= 0 && limit.max > limit.min)
    assert.ok(['items', 'tokens', 'chars'].includes(limit.unit))
  }
})

test('渲染区间按显示单位给出：预算那格是字符，且与 limits 只差一个换算因子', () => {
  for (const field of MEMORY_SCALE_FIELDS) {
    const widget = MEMORY_SCALE_WIDGET[field]
    const limit = MEMORY_SCALE_LIMITS[field]
    assert.ok(widget, `${field} 缺渲染区间`)
    const scale = field === 'maxTokens' ? BUDGET_CHARS_PER_TOKEN : 1
    assert.equal(widget.min, limit.min * scale)
    assert.equal(widget.max, limit.max * scale)
    assert.equal(widget.step, limit.step * scale)
    assert.equal(widget.unit, scale === 1 ? limit.unit : 'chars')
  }
})
