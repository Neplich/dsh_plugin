/**
 * InstructionsPage: the level's instruction files — AGENTS.md (base) and
 * AGENTS.local.md (local overlay) editable in place, CLAUDE.md companions
 * read-only when present. Saving writes atomically through the host route;
 * the harness's own watcher injects "Updated instructions from:" into live
 * sessions, and new sessions pick the file up at birth.
 */
import { useEffect, useState } from 'react'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { ScopeBar, styles, useRoots } from '@neplich/dsh-config-shared/client'
import { api } from './api.ts'
import type { InstructionFile, InstructionsResponse, Scope } from '../shared.ts'
import css from './InstructionsPage.module.css'

/** One writable instruction file (base / local only). */
type EditableInstructionFile = InstructionFile & { readonly kind: 'base' | 'local' }

/** Type guard narrowing the writable subset. */
function isEditable(file: InstructionFile): file is EditableInstructionFile {
  return file.kind === 'base' || file.kind === 'local'
}

/** Editable card for one writable instruction file (base / local). */
function InstructionEditor({
  file, scope, root, onSaved,
}: {
  file: EditableInstructionFile
  scope: Scope
  root: string | undefined
  onSaved: (files: InstructionsResponse, message: string) => void
}) {
  const [draft, setDraft] = useState(file.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  // Re-sync the draft when the file identity or its on-disk content changes.
  useEffect(() => { setDraft(file.content) }, [file.path, file.content])
  const dirty = draft !== file.content
  const title = file.kind === 'base' ? 'AGENTS.md' : 'AGENTS.local.md（本地覆盖）'
  return (
    <div className={css.card}>
      <div className={css.cardHeader}>
        <h3 className={css.cardTitle}>{title}</h3>
        <span className={styles.pathNote}>{file.path}</span>
        {!file.exists && <span className={styles.hint}>尚未创建</span>}
        {file.truncated && <span className={styles.error}>文件过大，仅显示部分内容，保存将覆盖为当前内容</span>}
      </div>
      <div className={css.cardBody}>
        <textarea
          className={css.editor}
          aria-label={title}
          value={draft}
          spellCheck={false}
          placeholder={file.kind === 'base' ? '编写该级别对所有会话生效的指令…' : '编写仅本机生效、不入库的覆盖指令…'}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <div className={css.actions}>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || saving || file.truncated}
            onClick={() => {
              setSaving(true)
              setError(undefined)
              api.writeInstruction({ scope, ...(root !== undefined ? { root } : {}), kind: file.kind, content: draft }).then(
                (files) => {
                  setSaving(false)
                  onSaved(files, file.exists ? '已保存' : '已创建 ' + title)
                },
                (err: unknown) => {
                  setSaving(false)
                  setError(String(err))
                },
              )
            }}
          >
            {saving ? '保存中…' : file.exists ? '保存' : '创建文件'}
          </Button>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => { setDraft(file.content) }}>
              还原
            </Button>
          )}
          {error !== undefined && <span className={styles.error}>{error}</span>}
        </div>
      </div>
    </div>
  )
}

/** Read-only disclosure for a CLAUDE.md companion. */
function ClaudeCard({ file }: { file: InstructionFile }) {
  const title = file.kind === 'claude' ? 'CLAUDE.md' : 'CLAUDE.local.md'
  return (
    <details className={css.card}>
      <summary className={css.summary}>
        {title}（只读，与 AGENTS.md 同链加载） · <span className={styles.pathNote}>{file.path}</span>
      </summary>
      <div className={css.cardBody}>
        <pre className={css.readonly}>{file.content}</pre>
      </div>
    </details>
  )
}

/** Render the instructions page. */
export function InstructionsPage() {
  const rootsState = useRoots(api.roots)
  const [scope, setScope] = useState<Scope>('personal')
  const [root, setRoot] = useState<string>()
  const [data, setData] = useState<InstructionsResponse>()
  const [error, setError] = useState<string>()
  const [toast, setToast] = useState<{ seq: number, text: string }>()

  useEffect(() => {
    if (scope === 'project' && root === undefined && rootsState.roots.length > 0) {
      setRoot(rootsState.roots[0]?.root)
    }
  }, [scope, root, rootsState.roots])

  const effectiveRoot = scope === 'project' ? root : undefined
  useEffect(() => {
    if (scope === 'project' && effectiveRoot === undefined) return
    let cancelled = false
    setData(undefined)
    setError(undefined)
    api.instructions(scope, effectiveRoot).then(
      (result) => { if (!cancelled) setData(result) },
      (err: unknown) => { if (!cancelled) setError(String(err)) },
    )
    return () => { cancelled = true }
  }, [scope, effectiveRoot])

  const writable = data?.files.filter(isEditable) ?? []
  const readonly = data?.files.filter((file) => !file.writable && file.exists) ?? []

  return (
    <div>
      <ScopeBar scope={scope} onScope={setScope} rootsState={rootsState} root={root} onRoot={setRoot} />
      <p className={styles.hint}>
        {scope === 'personal'
          ? '个人级指令对所有项目的所有会话生效。'
          : '项目根级指令对该仓库下的所有会话生效；子目录中的 AGENTS.md 由 Agent 在探索目录时按需加载，不在此管理。'}
        保存后即时生效：进行中的会话会收到更新提示，新会话直接加载最新内容。
      </p>
      {error !== undefined && <p className={styles.error}>{error}</p>}
      {data === undefined && error === undefined && <p className={css.loading}>加载中…</p>}
      <div className={css.cards}>
        {writable.map((file) => (
          <InstructionEditor
            key={file.kind}
            file={file}
            scope={scope}
            root={effectiveRoot}
            onSaved={(files, message) => {
              setData(files)
              setToast((previous) => ({ seq: (previous?.seq ?? 0) + 1, text: message }))
            }}
          />
        ))}
        {readonly.map((file) => <ClaudeCard key={file.kind} file={file} />)}
      </div>
      {toast !== undefined && (
        <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(undefined) }} />
      )}
    </div>
  )
}