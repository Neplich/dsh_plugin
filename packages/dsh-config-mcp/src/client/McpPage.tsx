/**
 * McpPage: live MCP server list (Loader entries, any source) with home-patch
 * management — create/edit/delete for managed servers, enable/disable for
 * all. Mutations write $DSH_HOME/cordis.patch.yml; the harness watches that
 * file and HMR-reloads the composition, so every mutation schedules a
 * delayed refetch to show the post-reload state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, IconEditOutline16, IconPlusOutline16, IconTrashOutline16, Modal, StateDot, Toast, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { styles } from '@neplich/dsh-config-shared/client'
import { api } from './api.ts'
import type { McpListResponse, McpServerInput, McpServerView } from '../shared.ts'
import css from './McpPage.module.css'

/** Map a fiber phase onto the StateDot semantic. */
function statusOf(server: McpServerView): { state: StateDotState, label: string } {
  if (!server.enabled) return { state: 'warning', label: '已禁用' }
  switch (server.fiberPhase) {
    case 'active': return { state: 'done', label: '运行中' }
    case 'failed': return { state: 'error', label: '失败' }
    case 'loading': case 'pending': return { state: 'ongoing', label: '连接中' }
    case 'unloading': return { state: 'ongoing', label: '重载中' }
    default: return { state: 'warning', label: '未加载' }
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
function parseKeyValues(text: string, label: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  for (const line of lines) {
    const cut = line.indexOf('=')
    if (cut <= 0) throw new Error(label + ' 存在格式错误的行：' + line)
    out[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Convert the form into a validated payload (throws on malformed fields). */
function formToInput(form: FormState): McpServerInput {
  const args = form.args.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  const timeout = form.toolCallTimeoutMs.trim()
  const env = parseKeyValues(form.env, '环境变量')
  const headers = parseKeyValues(form.headers, '请求头')
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
  editing, onClose, onSaved,
}: {
  /** The managed entry id being edited; undefined for create. */
  editing: string | undefined
  onClose: () => void
  onSaved: (message: string) => void
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
      input = formToInput(form)
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
      () => { onSaved(editing === undefined ? '已添加，正在热重载…' : '已保存，正在热重载…') },
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
      title={editing === undefined ? '添加 MCP 服务器' : '编辑 MCP 服务器'}
      closeLabel="关闭"
      description={editing === undefined
        ? '服务器将作为插件条目写入用户级 cordis.patch.yml，保存后自动热重载生效。'
        : '修改将整体替换该条目的配置，保存后自动热重载生效。'}
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" disabled={saving || loading} onClick={submit}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      )}
    >
      {loading
        ? <p className={css.loading}>加载中…</p>
        : (
          <div className={css.form}>
            <div className={css.fieldRow}>
              <div className={css.field}>
                <label className={css.fieldLabel} htmlFor="cc-mcp-name">名称（工具命名空间）</label>
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
                <span className={css.fieldLabel}>传输方式</span>
                <div className={css.radioRow}>
                  <label>
                    <input
                      type="radio"
                      checked={form.transport === 'stdio'}
                      onChange={() => { patch({ transport: 'stdio' }) }}
                    />
                    stdio（本地命令）
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
                    <label className={css.fieldLabel} htmlFor="cc-mcp-command">命令</label>
                    <input
                      id="cc-mcp-command"
                      className={css.monoInput}
                      value={form.command}
                      placeholder="npx"
                      onChange={(event) => { patch({ command: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-args">参数（每行一个）</label>
                    <textarea
                      id="cc-mcp-args"
                      className={css.monoInput}
                      value={form.args}
                      placeholder={'-y\n@modelcontextprotocol/server-github'}
                      onChange={(event) => { patch({ args: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-env">环境变量（每行 KEY=VALUE）</label>
                    <textarea
                      id="cc-mcp-env"
                      className={css.monoInput}
                      value={form.env}
                      placeholder="GITHUB_TOKEN=…"
                      onChange={(event) => { patch({ env: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-cwd">工作目录（可选）</label>
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
                    <label className={css.fieldLabel} htmlFor="cc-mcp-url">服务地址</label>
                    <input
                      id="cc-mcp-url"
                      className={css.monoInput}
                      value={form.url}
                      placeholder="http://localhost:3000/mcp"
                      onChange={(event) => { patch({ url: event.target.value }) }}
                    />
                  </div>
                  <div className={css.field}>
                    <label className={css.fieldLabel} htmlFor="cc-mcp-headers">请求头（每行 KEY=VALUE，可选）</label>
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
                <label className={css.fieldLabel} htmlFor="cc-mcp-timeout">工具调用超时（毫秒，可选）</label>
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
                <span className={css.fieldLabel}>启动行为</span>
                <label className={css.checkRow}>
                  <input
                    type="checkbox"
                    checked={form.failOnStartupError}
                    onChange={(event) => { patch({ failOnStartupError: event.target.checked }) }}
                  />
                  启动连接失败时加载失败（failOnStartupError）
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
export function McpPage() {
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
          管理写入用户级补丁文件{data !== undefined && <>：<span className={styles.pathNote}>{data.patchPath}</span></>}
          ，保存后由 dsh 自动热重载（断连重连）。
        </span>
        <span className={styles.toolbarSpacer} />
        <Button
          variant="primary"
          size="sm"
          icon={<IconPlusOutline16 size={14} />}
          onClick={() => { setDialog({ open: true, editing: undefined }) }}
        >
          添加服务器
        </Button>
      </div>
      {error !== undefined && <p className={styles.error}>{error}</p>}
      {data === undefined && error === undefined && <p className={css.loading}>加载中…</p>}
      {data !== undefined && servers.length === 0 && (
        <p className={css.empty}>还没有配置 MCP 服务器。点击右上角「添加服务器」接入第一个。</p>
      )}
      {servers.length > 0 && (
        <div className={css.table}>
          {servers.map((server) => {
            const status = statusOf(server)
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
                  {server.toolCount} 个工具
                </span>
                {!server.managed && (
                  <Tooltip label="由其他配置层提供，仅可在此禁用" side="top">
                    <span className={css.chip}>外部</span>
                  </Tooltip>
                )}
                <Tooltip label={server.enabled ? '禁用' : '启用'} side="top">
                  <button
                    type="button"
                    className={css.switch}
                    data-on={server.enabled ? 'true' : undefined}
                    role="switch"
                    aria-checked={server.enabled}
                    aria-label={server.enabled ? '禁用 ' + server.serverName : '启用 ' + server.serverName}
                    disabled={busy === server.id}
                    onClick={() => {
                      run(server.id, api.mcpState({ id: server.id, disabled: server.enabled }),
                        server.enabled ? '已禁用，正在热重载…' : '已启用，正在热重载…')
                    }}
                  />
                </Tooltip>
                <span className={css.actions}>
                  <Tooltip label={server.managed ? '编辑' : '仅用户级补丁管理的服务器可编辑'} side="top">
                    <button
                      type="button"
                      className={css.iconButton}
                      aria-label={'编辑 ' + server.serverName}
                      disabled={!server.managed || busy === server.id}
                      onClick={() => { setDialog({ open: true, editing: server.id }) }}
                    >
                      <IconEditOutline16 size={14} />
                    </button>
                  </Tooltip>
                  {confirmDelete === server.id
                    ? (
                      <span className={css.confirm}>
                        确认删除？
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy === server.id}
                          onClick={() => {
                            run(server.id, api.mcpDelete(server.id), '已删除，正在热重载…')
                          }}
                        >
                          删除
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setConfirmDelete(undefined) }}>取消</Button>
                      </span>
                    )
                    : (
                      <Tooltip label={server.managed ? '删除' : '仅用户级补丁管理的服务器可删除'} side="top">
                        <button
                          type="button"
                          className={css.iconButton}
                          data-danger="true"
                          aria-label={'删除 ' + server.serverName}
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
        />
      )}
      {toast !== undefined && (
        <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(undefined) }} />
      )}
    </div>
  )
}