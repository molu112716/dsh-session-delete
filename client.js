/**
 * Browser half of `dsh-session-delete`.
 *
 * Registers one row in a Session row's "..." menu (`sidebar.workspaces.session.menu.item`)
 * and one confirmation surface in the frame-wide overlay (`shell.overlay`).
 * Confirming calls the Host service's Remote method and the archived Session
 * leaves the sidebar through the Workspace follow stream.
 *
 * @module dsh-session-delete/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-delete',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dshSessionDelete'
    const ENDPOINT = 'sessionDeletion/delete'

    const dictionaries = {
      en: {
        'menu.delete': 'Delete session',
        'dialog.title': 'Delete session',
        'dialog.body': 'Permanently deletes the conversation history and local log of "{title}". This cannot be undone.',
        'dialog.cancel': 'Cancel',
        'dialog.confirm': 'Delete',
        'dialog.deleting': 'Deleting…',
        'untitled': 'Untitled session',
        'error.active': 'This session has running work. Stop it before deleting the session.',
        'error.invalid': 'This session cannot be deleted.',
        'error.connection': 'The connection to the harness is unavailable. Try again.',
      },
      zh: {
        'menu.delete': '删除会话',
        'dialog.title': '删除会话',
        'dialog.body': '将永久删除「{title}」的对话记录和本地日志，删除后无法恢复。',
        'dialog.cancel': '取消',
        'dialog.confirm': '删除',
        'dialog.deleting': '删除中…',
        'untitled': '未命名会话',
        'error.active': '该会话仍有正在进行的任务，请先停止后再删除。',
        'error.invalid': '无法删除这个会话。',
        'error.connection': '与 Harness 的连接不可用，请稍后重试。',
      },
    }

    const MENU_CSS = `
.dsd-menu-item { display: block; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-state-error-primary); font: inherit; font-size: 13px; line-height: 32px; text-align: left; cursor: pointer; }
.dsd-menu-item:hover, .dsd-menu-item:focus-visible { background: var(--dsw-alias-bg-layer-2); outline: none; }
`

    const DIALOG_CSS = `
.dsd-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.32); pointer-events: auto; }
.dsd-dialog { box-sizing: border-box; width: min(420px, calc(100vw - 32px)); padding: 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28); font-size: 13px; line-height: 1.6; }
.dsd-dialog-title { margin-bottom: 8px; font-size: 15px; font-weight: 600; }
.dsd-dialog-body { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsd-dialog-error { margin-top: 10px; color: var(--dsw-alias-state-error-primary); }
.dsd-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.dsd-button { height: 30px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.dsd-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dsd-button:disabled { opacity: 0.6; cursor: default; }
.dsd-button-danger { border-color: transparent; background: var(--dsw-alias-state-error-primary); color: #fff; }
.dsd-button-danger:hover:not(:disabled) { background: var(--dsw-alias-state-error-primary); filter: brightness(1.06); }
`

    /** The confirmation's open request and progress, shared by two slot entries. */
    function createStore() {
      let state = { target: null, busy: false, error: null }
      const listeners = new Set()
      return {
        get: () => state,
        set(patch) {
          state = { ...state, ...patch }
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    function DeleteSessionRow(props) {
      const t = typeof props.t === 'function' ? props.t : props.fallbackT
      const [, setMenuOpen] = props.useMenuOpenState()
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'dsd-menu-item',
          onClick: () => {
            setMenuOpen(false)
            props.requestDelete(props.sessionId, props.displayTitle)
          },
        },
        h('span', null, t('menu.delete')),
      )
    }

    function SessionDeleteDialog(props) {
      const t = typeof props.t === 'function' ? props.t : props.fallbackT
      const store = props.store
      const state = React.useSyncExternalStore(store.subscribe, store.get)
      const cancelRef = React.useRef(null)
      const target = state.target

      React.useEffect(() => {
        if (target !== null && cancelRef.current !== null) cancelRef.current.focus()
      }, [target])

      React.useEffect(() => {
        if (target === null) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' || store.get().busy) return
          event.stopPropagation()
          props.closeDialog()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [target, store, props.closeDialog])

      const title = target === null
        ? ''
        : typeof target.title === 'string' && target.title.trim() !== '' ? target.title : t('untitled')

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style' }, MENU_CSS + DIALOG_CSS),
        target === null ? null : h(
          'div',
          {
            key: 'backdrop',
            className: 'dsd-backdrop',
            onMouseDown: (event) => {
              if (event.target === event.currentTarget && !store.get().busy) props.closeDialog()
            },
          },
          h(
            'div',
            { className: 'dsd-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dsd-dialog-title' },
            h('div', { className: 'dsd-dialog-title', id: 'dsd-dialog-title' }, t('dialog.title')),
            h('div', { className: 'dsd-dialog-body' }, t('dialog.body', { title })),
            state.error === null ? null : h('div', { className: 'dsd-dialog-error', role: 'alert' }, state.error),
            h(
              'div',
              { className: 'dsd-dialog-actions' },
              h(
                'button',
                { type: 'button', className: 'dsd-button', ref: cancelRef, disabled: state.busy, onClick: props.closeDialog },
                t('dialog.cancel'),
              ),
              h(
                'button',
                { type: 'button', className: 'dsd-button dsd-button-danger', disabled: state.busy, onClick: props.confirmDelete },
                state.busy ? t('dialog.deleting') : t('dialog.confirm'),
              ),
            ),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, dictionaries),
          'dsh-session-delete: dictionaries',
        )
        const fallbackT = ctx.locale.bind(NS)
        const store = createStore()

        const closeDialog = () => store.set({ target: null, busy: false, error: null })

        const requestDelete = (sessionId, title) => {
          store.set({ target: { sessionId, title }, busy: false, error: null })
        }

        const confirmDelete = async () => {
          const current = store.get()
          if (current.target === null || current.busy) return
          store.set({ busy: true, error: null })
          try {
            const connection = ctx.get('connection')
            const rpc = connection === undefined ? undefined : connection.rpc
            if (rpc === undefined || typeof rpc.call !== 'function') {
              store.set({ busy: false, error: fallbackT('error.connection') })
              return
            }
            const result = await rpc.call('/api', ENDPOINT, { args: { sessionId: current.target.sessionId } })
            if (result === null || typeof result !== 'object' || result.ok !== true) {
              const detail = result !== null && typeof result === 'object' && result.error !== undefined ? result.error.message : ''
              store.set({ busy: false, error: detail !== '' ? String(detail) : fallbackT('error.connection') })
              return
            }
            const value = result.value
            if (value !== null && typeof value === 'object' && value.deleted === false) {
              store.set({
                busy: false,
                error: value.reason === 'active' ? fallbackT('error.active') : fallbackT('error.invalid'),
              })
              return
            }
            closeDialog()
          } catch (error) {
            const message = error instanceof Error && error.message !== '' ? error.message : fallbackT('error.connection')
            store.set({ busy: false, error: message })
          }
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register(
          {
            name: 'sidebar.workspaces.session.menu.item',
            id: 'session-delete.delete',
            order: 500,
            locale: NS,
            inject: () => ({ requestDelete, fallbackT }),
          },
          DeleteSessionRow,
        ))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'session-delete.dialog',
            order: 80,
            locale: NS,
            inject: () => ({ store, confirmDelete, closeDialog, fallbackT }),
          },
          SessionDeleteDialog,
        ))
      },
    }
  },
})
