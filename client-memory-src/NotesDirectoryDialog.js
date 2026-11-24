/**
 * 「选择笔记目录」弹层：一层目录一个列表，点进去，底部确认。
 *
 * 为什么自己渲染而不是调宿主的现成弹窗
 * ─────────────────────────────────
 * 宿主那套「选择工作区」的弹窗组件没有对外导出（`client.ts` 只导出 `apply`/`inject`），
 * 而它的数据通道（`uiWorkspace.listDirectory`）是公开的 Client 服务。所以这里只复用
 * **通道**、自己画一层薄 UI：视觉沿用设置页的 `dshpm-` 前缀与别名 token，
 * 行为与工作区选择器一致（面包屑下钻、只列目录、确认即选中当前层）。
 *
 * 三种状态必须分得开：加载中 / 失败（把宿主文案原样呈现）/ 空目录。把失败画成
 * "空文件夹"会让用户以为"这台机器上一个目录都没有"。
 */
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { crumbLabel, initialDirectory } from './notes-directory.js'
import { settingsCss as css } from './styles.js'

/**
 * 目录选择弹层。
 *
 * @param props.open - 是否显示（关闭时不渲染任何 DOM）。
 * @param props.value - 当前配置值，决定首次打开的起始层。
 * @param props.directory - {@link directoryAccess} 的结果（`list` 必须存在）。
 * @param props.t - 翻译函数（命名空间 `dsh-project-memory.settings`）。
 * @param props.onPick - 用户确认后回调，参数是绝对路径。
 * @param props.onClose - 取消 / 遮罩 / Escape。
 */
export function NotesDirectoryDialog(props) {
  const open = props.open === true
  const directory = props.directory
  const t = props.t ?? ((key) => key)
  const onPick = props.onPick
  const onClose = props.onClose

  // `undefined` = 宿主 home（宿主的 listDirectory 约定：不给 path 就列 home）。
  const [path, setPath] = useState(undefined)
  const [listing, setListing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // 旧请求的迟到结果绝不能覆盖新的一层：序号对不上就整包丢掉。
  const seq = useRef(0)
  // 值只在打开那一刻读一次；打开期间父组件重渲染不该把用户踢回起始目录。
  const valueRef = useRef(props.value)
  valueRef.current = props.value

  const load = useCallback((next) => {
    const mine = ++seq.current
    setLoading(true)
    setError('')
    let pending
    try {
      pending = Promise.resolve(directory.list(next))
    } catch (err) {
      pending = Promise.reject(err)
    }
    pending.then((data) => {
      if (mine !== seq.current) return
      setListing(data === undefined ? null : data)
      setLoading(false)
    }, (err) => {
      if (mine !== seq.current) return
      setLoading(false)
      setError(err && err.message ? String(err.message) : String(err))
    })
  }, [directory])

  useEffect(() => {
    if (!open) {
      // 关掉即作废在飞的请求，并清干净下一次打开要用的状态。
      seq.current += 1
      setListing(null)
      setError('')
      setLoading(false)
      setPath(undefined)
      return
    }
    const start = initialDirectory(valueRef.current)
    setPath(start)
    load(start)
  }, [open, load])

  // Escape 关闭：与宿主弹层一致，也避免用户只能去点那个小叉。
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const crumbs = Array.isArray(listing?.crumbs) ? listing.crumbs : []
  const entries = Array.isArray(listing?.entries) ? listing.entries : []
  const home = typeof listing?.home === 'string' ? listing.home : ''
  const current = typeof listing?.path === 'string' && listing.path !== '' ? listing.path : path
  const go = (next) => {
    setPath(next)
    load(next)
  }

  const head = h('div', { className: css.dialogHead, key: 'head' },
    h('span', { className: css.dialogTitle }, t('settings.notes.picker.title')),
    h('button', {
      type: 'button',
      className: css.dialogClose,
      onClick: () => { onClose?.() },
      'aria-label': t('settings.notes.picker.close'),
    }, '×'))

  const crumbRow = h('div', { className: css.crumbs, key: 'crumbs' },
    home !== '' && home !== current
      ? h('button', {
        type: 'button',
        className: css.crumb,
        key: 'home',
        title: home,
        onClick: () => { go(home) },
      }, t('settings.notes.picker.home'))
      : null,
    ...crumbs.map((crumb, index) => h('button', {
      type: 'button',
      className: index === crumbs.length - 1 ? css.crumbCurrent : css.crumb,
      key: String(crumb?.path ?? index),
      title: String(crumb?.path ?? ''),
      disabled: index === crumbs.length - 1,
      onClick: () => { if (crumb?.path) go(String(crumb.path)) },
    }, crumbLabel(crumb))))

  let body
  if (loading) {
    body = h('p', { className: css.dialogNote, key: 'loading' }, t('settings.notes.picker.loading'))
  } else if (error !== '') {
    body = h('p', { className: css.dialogError, key: 'error', role: 'status' }, error)
  } else if (entries.length === 0) {
    body = h('p', { className: css.dialogNote, key: 'empty' }, t('settings.notes.picker.empty'))
  } else {
    body = [
      ...entries.map((entry) => h('button', {
        type: 'button',
        className: entry?.hidden === true ? css.directoryRowHidden : css.directoryRow,
        key: String(entry?.path ?? entry?.name ?? Math.random()),
        title: String(entry?.path ?? ''),
        onClick: () => { if (entry?.path) go(String(entry.path)) },
      },
      h('span', { className: css.directoryIcon, key: 'icon', 'aria-hidden': 'true' }, '📁'),
      h('span', { className: css.directoryName, key: 'name' }, String(entry?.name ?? '')))),
      listing?.truncated === true
        ? h('p', { className: css.dialogNote, key: 'truncated' }, t('settings.notes.picker.truncated'))
        : null,
    ]
  }

  const foot = h('div', { className: css.dialogFoot, key: 'foot' },
    h('span', {
      className: css.dialogPath,
      title: current || '',
    }, current || t('settings.notes.picker.home')),
    h('button', {
      type: 'button',
      className: css.dialogBtn,
      onClick: () => { onClose?.() },
    }, t('settings.notes.picker.cancel')),
    h('button', {
      type: 'button',
      className: css.dialogBtnPrimary,
      disabled: loading || error !== '' || typeof current !== 'string' || current === '',
      onClick: () => {
        if (typeof current !== 'string' || current === '') return
        onPick?.(current)
        onClose?.()
      },
    }, t('settings.notes.picker.use')))

  return h('div', {
    className: css.dialogMask,
    onMouseDown: (event) => { if (event.target === event.currentTarget) onClose?.() },
  },
  h('div', {
    className: css.dialog,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('settings.notes.picker.title'),
    onMouseDown: (event) => { event.stopPropagation() },
  }, head, crumbRow, h('div', { className: css.directoryList, key: 'list' }, body), foot))
}
