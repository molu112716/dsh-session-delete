# dsh-session-delete

A DeepSeek Harness (DSH) Web plugin that adds **Delete session** to a conversation's `⋯` menu.
It deletes the conversation for real — the local session log, the projection cache, and the
sidebar account — instead of only archiving it.

## What it does

Choosing **Delete session** opens a confirmation dialog, then the Host:

1. **Archives the workspace account first.** This is the same gate the shipped Archive action
   uses: a Session with running work (its own turn, a running subagent, a background job, or an
   active reminder) is refused with a notice instead of being deleted underneath the work.
2. **Deletes the session log directory** `<DSH_HOME>/sessions/<project>/<sessionId>/`.
3. **Deletes the projection cache record** `<DSH_HOME>/storages/session_projcache/sessions/<sessionId>.json`.

The row leaves the sidebar as soon as the archive lands, so the result is visible immediately.

## Requirements

- DSH `>=0.2.1-rc.5` (`engines.dsh`).
- The `workspace`, `session-persistence-jsonl`, and `session-projection-cache` rows, which every
  base-backed Web profile already composes.

## Install

After publishing to a registry:

```text
plugin_manager { action: "install_bundle", target: "dsh-session-delete@1.0.0" }
```

From a packed tarball or a checkout directory, install that path instead. The bundle declares one
Host row (`session-delete`) and one `dsh.client` entry, so enabling it needs no extra patch.

## Using it

1. Hover a Session row in the left sidebar and open its `⋯` menu.
2. Choose **删除会话 / Delete session** (the last row, after **Copy Session ID**).
3. Confirm in the dialog. `Esc`, the backdrop, or **Cancel** keeps the Session.

If the Session still has running work the Host refuses and the dialog explains why; stop the work
first (the same way the stop button does) and delete again.

## Implementation notes

- **Host half** (`index.js`): one Cordis service, `sessionDeletion`, registered with `ctx.provide()`
  and published to the browser through the Typert Gateway's source-mode fallback (a `typertRemote`
  binding plus the protocol's versioned method descriptor on the class prototype). It imports no
  `@deepseek-ai/*` package, so it loads from any profile directory; the only imports are `node:fs`,
  `node:os`, and `node:path`.
- **Browser half** (`client.js`): a Module Loader module that registers one row in
  `sidebar.workspaces.session.menu.item` (order 500) and one confirmation surface in
  `shell.overlay`. It calls the Host with `ctx.get('connection').rpc.call('/api', 'sessionDeletion/delete', …)`.
- All visible copy comes from the plugin's own locale namespace (`zh` + `en`); colours and surfaces
  use the host theme tokens (`--dsw-alias-*`).

## Limitations

- **No undo.** The log is removed from disk; nothing in DSH can restore it.
- **One Session at a time.** The menu row deletes the row you opened it on; there is no bulk delete.
- **Archived-set residue.** Deletion archives the account before removing the files, so the
  workspace's archived set may keep the id. It is invisible — the sidebar renders rows from Session
  summaries, and a deleted Session has none.
- **Local disk layout.** The paths come from `DSH_HOME` (falling back to `~/.dsh`); a deployment that
  moves the session root elsewhere needs the plugin's path constants updated.

## License

MIT — see [LICENSE](LICENSE).
