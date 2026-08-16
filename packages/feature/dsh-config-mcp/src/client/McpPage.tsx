/**
 * McpPage: live MCP server list (Loader entries, any source) with home-patch
 * management — create/edit/delete for managed servers, enable/disable for
 * all. Mutations write $DSH_HOME/cordis.patch.yml; the harness watches that
 * file and HMR-reloads the composition, so every mutation schedules a
 * delayed refetch to show the post-reload state. All copy goes through the
 * plugin's 'config-mcp' translate seat.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, IconEditOutline16, IconPlusOutline16, IconTrashOutline16, Modal, StateDot, Toast, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { styles } from '@neplich/dsh-config-shared/client'
import { api } from './api.ts'
import type { McpListResponse, McpServerInput, McpServerView } from '../shared.ts'
import css from './McpPage.module.css'

/** Translate seat of the 'config-mcp' namespace (own keys + shared scope keys). */
type McpTranslate = TranslateNS<'config-mcp'>

/** Map a fiber phase onto the StateDot semantic. */
function statusOf(server: McpServerView, t: McpTranslate): { state: StateDotState, label: string } {
  if (!server.enabled) return { state: 'warning', label: t('status.disabled') }
  switch (server.fiberPhase) {
    case 'active': return { state: 'done', label: t('status.active') }
    case 'failed': return { state: 'error', label: t('status.failed') }
    case 'loading': case 'pending': return { state: 'ongoing', label: t('status.connecting') }
    case 'unloading': return { state: 'ongoing', label: t('status.reloading') }
    default: return { state: 'warning', label: t('status.notLoaded') }
  }
}

/** Editor form state: strings everywhere, parsed on submit. */
interface FormState {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
  toolCallTimeoutMs: string
  failOnStartupError: boolean
}

/** Blank form for the create flow. */
const EMPTY_FORM: FormState = {
  serverName: '', transport: 'stdio', command: '', args: '', env: '', cwd: '',
  url: '', headers: '', toolCallTimeoutMs: '', failOnStartupError: false,
}

/** Parse KEY=VALUE lines into a record; malformed lines throw with their line number. */
function parseKeyValues(text: string, label: string, t: McpTranslate): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  for (const line of lines) {
    const cut = line.indexOf('=')
    if (cut <= 0) throw new Error(t('form.malformedLine', { label, line }))
    out[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Convert the form into a validated payload (throws on malformed fields). */
function formToInput(form: FormState, t: McpTranslate): McpServerInput {
  const args = form.args.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  const timeout = form.toolCallTimeoutMs.trim()
  const env = parseKeyValues(form.env, t('field.env'), t)
  const headers = parseKeyValues(form.headers, t('field.headers'), t)
  return {
    serverName: form.serverName.trim(),
    transport: form.transport,
    ...(form.transport === 'stdio'
      ? {
        command: form.command.trim(),
        ...(args.length > 0 ? { args } : {}),
        ...(env !== undefined ? { env } : {}),
        ...(form.cwd.trim() !== '' ? { cwd: form.cwd.trim() } : {}),
      }
      : {
        url: form.url.trim(),
        ...(headers !== undefined ? { headers } : {}),
      }),
    ...(timeout !== '' ? { toolCallTimeoutMs: Number(timeout) } : {}),
    ...(form.failOnStartupError ? { failOnStartupError: true } : {}),
  }
}

/** Prefill the form from a managed row's raw detail. */
function inputToForm(input: McpServerInput): FormState {
  const lines = (record: Readonly<Record<string, string>> | undefined): string =>
    record === undefined ? '' : Object.entries(record).map(([key, value]) => key + '=' + value).join('\n')
  return {
    serverName: input.serverName,
    transport: input.transport,
    command: input.command ?? '',
    args: (input.args ?? []).join('\n'),
    env: lines(input.env),
    cwd: input.cwd ?? '',
    url: input.url ?? '',
    headers: lines(input.headers),
    toolCallTimeoutMs: input.toolCallTimeoutMs === undefined ? '' : String(input.toolCallTimeoutMs),
    failOnStartupError: input.failOnStartupError === true,
  }
}

/** Create/edit dialog. */
function ServerDialog({
  editing, onClose, onSaved, t,
}: {
  /** The managed entry id being edited; undefined for create. */
  editing: string | undefined
  onClose: () => void
  onSaved: (message: string) => void
  t: McpTranslate
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(editing !== undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (editing === undefined) return
    let cancelled = false
    api.mcpDetail(editing).then(
      (detail) => {
        if (cancelled) return
        setForm(inputToForm(detail.server))
        setLoading(false)
      },
      (err: unknown) => {
        if (cancelled) return
        setError(String(err))
        setLoading(false)
      },
    )
    return () => { cancelled = true }
  }, [editing])

  const patch = (part: Partial<FormState>): void => { setForm((previous) => ({ ...previous, ...part })) }
  const submit = (): void => {
    let input: McpServerInput
    try {
      input = formToInput(form, t)
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      return
    }
    setSaving(true)
    setError(undefined)
    const request = editing === undefined
      ? api.mcpCreate({ server: input })
      : api.mcpUpdate({ id: editing, server: input })
    request.then(
      () => { onSaved(editing === undefined ? t('toast.added') : t('toast.saved')) },
      (err: unknown) => {
        setSaving(false)
        setError(String(err))
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing === undefined ? t('dialog.addTitle') : t('dialog.editTitle')}
      closeLabel={t('action.close')}
      description={editing === undefined ? t('dialog.addDescription') : t('dialog.editDescription')}
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" size="sm" disabled={saving || loading} onClick={submit}>
            {saving ? t('action.saving') : t('action.save')}
          </Button>
        </>
      )}
    >
      {loading
        ? <p className={css.loading}>{t('loading')}</p>
        : (
          <div className={css.form}>
            <div className={css.fieldRow}>
              <div className={css.field}>
                <label className={css.fieldLabel} htmlFor="cc-mcp-name">{t('field.name')}</label>
                <input
                  id="cc-mcp-name"
                  className={css.monoInput}
                  value={form.serverName}
                  disabled={editing !== undefined}
                  placeholder="github"
                  onChange={(event) => { patch({ serverName: event.target.value }) }}
                />
              </div>
              <div className={css.field}>
                <span className={css.fieldLabel}>{t('field.transport')}</span>
                <div className={css.radioRow}>
                  <label>
                    <input
                      type="radio"
                      checked={form.transport === 'stdio'}
                      onChange={() => { patch({ transport: 'stdio' }) }}
                    />
                    {t('field.transportStdio')}
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={form.transport === 'streamable-http'}
                      onChange={() => { patch({ transport: 'streamable-http' }) }}
                    />
                    streamable-http
                  </label>
                </div>
              </div>
            </div>
            {form.transport === 'stdio'
              ? (
                <>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-command">{t('field.command')}</label>
                    <input
                      id="cc-mcp-command"
                      className={css.monoInput}
                      value={form.command}
                      placeholder="npx"
                      onChange={(event) => { patch({ command: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-args">{t('field.args')}</label>
                    <textarea
                      id="cc-mcp-args"
                      className={css.monoInput}
                      value={form.args}
                      placeholder={'-y\n@modelcontextprotocol/server-github'}
                      onChange={(event) => { patch({ args: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-env">{t('field.envLines')}</label>
                    <textarea
                      id="cc-mcp-env"
                      className={css.monoInput}
                      value={form.env}
                      placeholder="GITHUB_TOKEN=…"
                      onChange={(event) => { patch({ env: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-cwd">{t('field.cwd')}</label>
                    <input
                      id="cc-mcp-cwd"
                      className={css.monoInput}
                      value={form.cwd}
                      onChange={(event) => { patch({ cwd: event.target.value }) }}
                    />
                  </div>
                </>
              )
              : (
                <>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-url">{t('field.url')}</label>
                    <input
                      id="cc-mcp-url"
                      className={css.monoInput}
                      value={form.url}
                      placeholder="http://localhost:3000/mcp"
                      onChange={(event) => { patch({ url: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-headers">{t('field.headersLines')}</label>
                    <textarea
                      id="cc-mcp-headers"
                      className={css.monoInput}
                      value={form.headers}
                      placeholder="Authorization=Bearer …"
                      onChange={(event) => { patch({ headers: event.target.value }) }}
                    />
                  </div>
                </>
              )}
            <div className={css.fieldRow}>
              <div className={css.field}>
                <label className={css.fieldLabel} htmlFor="cc-mcp-timeout">{t('field.timeout')}</label>
                <input
                  id="cc-mcp-timeout"
                  className={css.textInput}
                  inputMode="numeric"
                  value={form.toolCallTimeoutMs}
                  placeholder="60000"
                  onChange={(event) => { patch({ toolCallTimeoutMs: event.target.value }) }}
                />
              </div>
              <div className={css.field}>
                <span className={css.fieldLabel}>{t('field.startup')}</span>
                <label className={css.checkRow}>
                  <input
                    type="checkbox"
                    checked={form.failOnStartupError}
                    onChange={(event) => { patch({ failOnStartupError: event.target.checked }) }}
                  />
                  {t('field.failOnStartupError')}
                </label>
              </div>
            </div>
            {error !== undefined && <span className={css.formError}>{error}</span>}
          </div>
        )}
    </Modal>
  )
}

/** Render the MCP servers page. */
export function McpPage({ t }: { t: McpTranslate }) {
  const [data, setData] = useState<McpListResponse>()
  const [error, setError] = useState<string>()
  const [toast, setToast] = useState<{ seq: number, text: string }>()
  const [dialog, setDialog] = useState<{ open: boolean, editing: string | undefined }>({ open: false, editing: undefined })
  const [confirmDelete, setConfirmDelete] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const refetchTimer = useRef<number>()

  const refresh = useCallback((): void => {
    api.mcp().then(
      (result) => {
        setData(result)
        setError(undefined)
      },
      (err: unknown) => { setError(String(err)) },
    )
  }, [])

  useEffect(() => {
    refresh()
    return () => { window.clearTimeout(refetchTimer.current) }
  }, [refresh])

  // Mutations land through the watched patch file: the composition HMRs and
  // the touched server reconnects, so the list repaints on a delay.
  const afterMutation = useCallback((message: string): void => {
    setDialog({ open: false, editing: undefined })
    setConfirmDelete(undefined)
    setToast((previous) => ({ seq: (previous?.seq ?? 0) + 1, text: message }))
    window.clearTimeout(refetchTimer.current)
    refetchTimer.current = window.setTimeout(refresh, 1500)
  }, [refresh])

  const run = (id: string, action: Promise<unknown>, message: string): void => {
    setBusy(id)
    action.then(
      () => {
        setBusy(undefined)
        afterMutation(message)
      },
      (err: unknown) => {
        setBusy(undefined)
        setToast((previous) => ({ seq: (previous?.seq ?? 0) + 1, text: String(err) }))
      },
    )
  }

  const servers = data?.servers ?? []

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={styles.hint}>
          {t('toolbar.note')}{data !== undefined && <>：<span className={styles.pathNote}>{data.patchPath}</span></>}
          {t('toolbar.noteSuffix')}
        </span>
        <span className={styles.toolbarSpacer} />
        <Button
          variant="primary"
          size="sm"
          icon={<IconPlusOutline16 size={14} />}
          onClick={() => { setDialog({ open: true, editing: undefined }) }}
        >
          {t('action.addServer')}
        </Button>
      </div>
      {error !== undefined && <p className={styles.error}>{error}</p>}
      {data === undefined && error === undefined && <p className={css.loading}>{t('loading')}</p>}
      {data !== undefined && servers.length === 0 && (
        <p className={css.empty}>{t('empty')}</p>
      )}
      {servers.length > 0 && (
        <div className={css.table}>
          {servers.map((server) => {
            const status = statusOf(server, t)
            return (
              <div key={server.id} className={css.row} data-disabled={server.enabled ? undefined : 'true'}>
                <span className={css.status}>
                  <StateDot state={status.state} size={10} />
                  {status.label}
                </span>
                <span className={css.name} title={server.id}>{server.serverName}</span>
                <span className={css.chip}>{server.transport === 'stdio' ? 'stdio' : 'http'}</span>
                <span className={css.summary} title={server.summary}>{server.summary}</span>
                <span className={css.chip} data-tone={server.toolCount > 0 ? 'brand' : undefined}>
                  {t('tools.count', { count: server.toolCount })}
                </span>
                {!server.managed && (
                  <Tooltip label={t('external.tip')} side="top">
                    <span className={css.chip}>{t('external')}</span>
                  </Tooltip>
                )}
                <Tooltip label={server.enabled ? t('action.disable') : t('action.enable')} side="top">
                  <button
                    type="button"
                    className={css.switch}
                    data-on={server.enabled ? 'true' : undefined}
                    role="switch"
                    aria-checked={server.enabled}
                    aria-label={t(server.enabled ? 'action.disable' : 'action.enable') + ' ' + server.serverName}
                    disabled={busy === server.id}
                    onClick={() => {
                      run(server.id, api.mcpState({ id: server.id, disabled: server.enabled }),
                        server.enabled ? t('toast.disabled') : t('toast.enabled'))
                    }}
                  />
                </Tooltip>
                <span className={css.actions}>
                  <Tooltip label={server.managed ? t('action.edit') : t('edit.unmanagedTip')} side="top">
                    <button
                      type="button"
                      className={css.iconButton}
                      aria-label={t('action.edit') + ' ' + server.serverName}
                      disabled={!server.managed || busy === server.id}
                      onClick={() => { setDialog({ open: true, editing: server.id }) }}
                    >
                      <IconEditOutline16 size={14} />
                    </button>
                  </Tooltip>
                  {confirmDelete === server.id
                    ? (
                      <span className={css.confirm}>
                        {t('delete.confirm')}
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy === server.id}
                          onClick={() => {
                            run(server.id, api.mcpDelete(server.id), t('toast.deleted'))
                          }}
                        >
                          {t('action.delete')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setConfirmDelete(undefined) }}>{t('action.cancel')}</Button>
                      </span>
                    )
                    : (
                      <Tooltip label={server.managed ? t('action.delete') : t('delete.unmanagedTip')} side="top">
                        <button
                          type="button"
                          className={css.iconButton}
                          data-danger="true"
                          aria-label={t('action.delete') + ' ' + server.serverName}
                          disabled={!server.managed || busy === server.id}
                          onClick={() => { setConfirmDelete(server.id) }}
                        >
                          <IconTrashOutline16 size={14} />
                        </button>
                      </Tooltip>
                    )}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {dialog.open && (
        <ServerDialog
          editing={dialog.editing}
          onClose={() => { setDialog({ open: false, editing: undefined }) }}
          onSaved={afterMutation}
          t={t}
        />
      )}
      {toast !== undefined && (
        <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(undefined) }} />
      )}
    </div>
  )
}
