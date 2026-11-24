/**
 * 「笔记检索」设置表单的行为测试（client-memory-src/notes-settings.js）。
 *
 * 锁三件事：
 *   1. **嵌套路径**：写入的 ops 必须是 `{op:'set', path:['notes','repo']}`。宿主对
 *      `['notes.repo']` 这种单段字符串会被 isVolatilePath 判成"不是 volatile"直接拒绝，
 *      而这类错误只在真实宿主上才炸 —— 所以把形状钉在测试里。
 *   2. **volatile ref 的读取**：值可能以 `{get()}` 形式出现（宿主注入），表单必须读出值
 *      而不是把 ref 对象当字符串。
 *   3. 草稿语义：空文本 = unset（回到"未配置"）、非法超时不写入、保存成功后草稿清空。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { NOTES_FIELDS, NotesSettingsForm } from '../client-memory-src/notes-settings.js'

/** 假的 configForms scope：形状照宿主 ConfigFormController（getSnapshot/subscribe/mutate）。 */
function fakeScope({ value = {}, base = {}, user = {}, writable = true, status = 'ready' } = {}) {
  const listeners = new Set()
  const calls = []
  const snapshot = {
    status,
    writable,
    value: { notes: { enabled: true, repo: '', timeoutMs: 30000, ...value.notes }, ...value },
    base: { notes: { ...base.notes } },
    user: { notes: { ...user.notes } },
    revision: 7,
  }
  return {
    calls,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    mutate: async (ops, revision) => {
      calls.push({ ops, revision })
      return true
    },
  }
}

test('字段顺序与命名稳定（卡片按这个顺序渲染）', () => {
  assert.deepEqual(NOTES_FIELDS, ['repo', 'enabled', 'timeoutMs'])
})

test('目录走嵌套路径写入，revision 取自打开表单时的快照', async () => {
  const scope = fakeScope({ value: { notes: { repo: '' } } })
  const form = new NotesSettingsForm(scope)
  assert.equal(form.field('repo').text, '', '未配置时输入框是空的')

  form.actions().editNotes('repo', ' ~/note ')
  assert.equal(form.shell().dirty, true)
  assert.equal(form.field('repo').invalid, false)

  await form.save()
  assert.equal(scope.calls.length, 1)
  assert.deepEqual(scope.calls[0].ops, [{ op: 'set', path: ['notes', 'repo'], value: '~/note' }])
  assert.equal(scope.calls[0].revision, 7)
  // 保存成功后草稿清空，但快照没变（假 scope 不回声）：按钮重新变灰
  assert.equal(form.shell().dirty, false)
  form.dispose()
})

test('空文本 = unset（回到未配置），不是写空字符串', async () => {
  const scope = fakeScope({ value: { notes: { repo: '~/note' } }, user: { notes: { repo: '~/note' } } })
  const form = new NotesSettingsForm(scope)
  assert.equal(form.field('repo').overridden, true, 'profile 里覆盖过要标"已覆盖"')

  form.actions().editNotes('repo', '   ')
  await form.save()
  assert.deepEqual(scope.calls[0].ops, [{ op: 'unset', path: ['notes', 'repo'] }])
  form.dispose()
})

test('开关与超时各自成 op，非法超时挡在保存之外', async () => {
  const scope = fakeScope()
  const form = new NotesSettingsForm(scope)

  form.actions().editNotes('enabled', 'false')
  form.actions().editNotes('timeoutMs', '500')
  assert.equal(form.field('timeoutMs').invalid, true, '低于 1 秒视为非法')
  assert.equal(form.shell().invalid, true)

  await form.save()
  assert.equal(scope.calls.length, 0, '非法草稿不写宿主')

  form.actions().editNotes('timeoutMs', '45000')
  await form.save()
  assert.deepEqual(scope.calls.at(-1).ops, [
    { op: 'set', path: ['notes', 'enabled'], value: false },
    { op: 'set', path: ['notes', 'timeoutMs'], value: 45000 },
  ])
  form.dispose()
})

test('值与生效值相同时不算 dirty', async () => {
  const scope = fakeScope({ value: { notes: { repo: '~/note' } } })
  const form = new NotesSettingsForm(scope)
  form.actions().editNotes('repo', '~/note')
  assert.equal(form.shell().dirty, false)
  await form.save()
  assert.equal(scope.calls.length, 0)
  form.dispose()
})

test('volatile ref 形状（{get()}）也能读出当前值', () => {
  const scope = fakeScope({ value: { notes: { repo: { get: () => '~/notes2' } } } })
  const form = new NotesSettingsForm(scope)
  // 宿主 settings 快照给的是 plainConfig 后的普通值；这里模拟"没经 plainConfig"的形态，
  // 保证表单不会把 ref 对象当字符串渲染成 "[object Object]"。
  assert.equal(form.field('repo').text, '~/notes2', 'ref 要解包，不能渲染成 [object Object]')
  form.dispose()
})

test('命名空间不可用时 shell.available 为 false，仍可渲染空值', () => {
  const scope = fakeScope({ status: 'unavailable', value: {} })
  const form = new NotesSettingsForm(scope)
  assert.equal(form.shell().available, false)
  assert.equal(form.field('repo').text, '')
  form.dispose()
})
