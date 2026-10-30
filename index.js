/**
 * Host half of `dsh-session-delete`: one Cordis service that the browser half
 * calls through the Typert Gateway's source-mode Remote fallback.
 *
 * A Session owns three pieces of local state: its append-only JSONL log under
 * `<DSH_HOME>/sessions/<project>/<id>/`, its projection-cache record under
 * `<DSH_HOME>/storages/session_projcache/sessions/<id>.json`, and its account
 * in the Workspace registry. The Session log seam has no deletion API, so this
 * service removes the files directly, after archiving the account — the same
 * gate the shipped Archive action uses, which refuses while the Session has
 * running work instead of deleting underneath it.
 *
 * The plugin registers the service with `ctx.provide()` rather than extending
 * Cordis' `Service` class, so it needs no harness package import and resolves
 * from a profile-installed bundle. A service registered this way is exactly
 * what the Gateway's source-mode scan looks for: a `reflect` entry of type
 * `service` carrying a `typertRemote` binding plus the protocol's versioned
 * method descriptor on its prototype.
 *
 * @module dsh-session-delete
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export const name = 'session-delete'
export const inject = ['sessionPersistence', 'workspaceRegistry']

const SERVICE_KEY = 'sessionDeletion'
/** Stable key of the Typert Remote method-descriptor property on a class prototype. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
/** A Session id is used as one path segment below the session root. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** The harness home, matching the `dshHomePath()` the shipped rows use. */
function dshHome() {
  const configured = process.env.DSH_HOME
  return configured !== undefined && configured !== '' ? configured : path.join(homedir(), '.dsh')
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Resolve the session-owned log directory. The project directory in between is
 * derived from the Session's recorded working directory, so it is found by
 * scanning one level; a path-safe id keeps its own name.
 */
async function findSessionDirectory(root, sessionId) {
  const direct = path.join(root, sessionId)
  if (await isDirectory(direct)) return direct
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const candidate = path.join(root, project.name, sessionId)
    if (await isDirectory(candidate)) return candidate
  }
  return undefined
}

/** The single Remote method set; the descriptor below publishes `delete`. */
class SessionDeletionApi {
  /**
   * Delete one Session's local state and hide its workspace account.
   * @param sessionId - the Session to delete.
   * @returns a JSON result: `{ sessionId, deleted }`, with `reason: 'active'`
   *   when running work blocked the deletion and `reason: 'invalid-id'` for a
   *   value that cannot name a Session directory.
   */
  async delete(sessionId) {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      return { sessionId: typeof sessionId === 'string' ? sessionId : '', deleted: false, reason: 'invalid-id' }
    }
    const home = dshHome()
    const sessionRoot = path.join(home, 'sessions')
    const cacheRoot = path.join(home, 'storages', 'session_projcache', 'sessions')

    let persisted = false
    try {
      persisted = (await this.ctx.sessionPersistence.stat(sessionId)) !== undefined
    } catch {
      // An unreadable or corrupt log is still a directory worth deleting.
      persisted = true
    }
    const live = this.ctx.get('agents')?.get?.(sessionId)
    if (!persisted && live === undefined) return { sessionId, deleted: true, removedLog: false }

    let warning
    try {
      await this.ctx.workspaceRegistry.archiveSession(sessionId)
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'activity' in error) {
        return { sessionId, deleted: false, reason: 'active' }
      }
      // A corrupt log can refuse the archive probe; its files are still removable.
      warning = error instanceof Error ? error.message : String(error)
    }

    const directory = await findSessionDirectory(sessionRoot, sessionId)
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
    await rm(path.join(cacheRoot, `${sessionId}.json`), { force: true })

    return {
      sessionId,
      deleted: true,
      removedLog: directory !== undefined,
      ...(warning === undefined ? {} : { warning }),
    }
  }
}

// Source-mode Remote marker; the decorator would write exactly this record.
Object.defineProperty(SessionDeletionApi.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'delete', invocation: Object.freeze({ kind: 'direct' }) },
    ]),
  }),
})

/**
 * Register the deletion service on this plugin's fiber.
 * @param ctx - the plugin context; both injected services are live here.
 */
export function apply(ctx) {
  const service = Object.assign(new SessionDeletionApi(), { ctx })
  service.typertRemote = Object.freeze({
    service,
    serviceKey: SERVICE_KEY,
    namespace: SERVICE_KEY,
  })
  ctx.provide(SERVICE_KEY, service)
}
