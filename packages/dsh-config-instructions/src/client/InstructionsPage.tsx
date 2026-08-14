/**
 * InstructionsPage: the level's instruction files — AGENTS.md (base) and
 * AGENTS.local.md (local overlay) editable in place, CLAUDE.md companions
 * read-only when present. Saving writes atomically through the host route;
 * the harness's own watcher injects "Updated instructions from:" into live
 * sessions, and new sessions pick the file up at birth. All copy goes
 * through the plugin's 'config-instructions' translate seat.
 */
import { useEffect, useState } from 'react'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ScopeBar, styles, useRoots } from '@neplich/dsh-config-shared/client'
import { api } from './api.ts'
import type { InstructionFile, InstructionsResponse, Scope } from '../shared.ts'
import css from './InstructionsPage.module.css'

/** Translate seat of the 'config-instructions' namespace (own keys + shared scope keys). */
type InstructionsTranslate = TranslateNS<'config-instructions'>

/** One writable instruction file (base / local only). */
type EditableInstructionFile = InstructionFile & { readonly kind: 'base' | 'local' }

/** Type guard narrowing the writable subset. */
function isEditable(file: InstructionFile): file is EditableInstructionFile {
  return file.kind === 'base' || file.kind === 'local'
}

/** Editable card for one writable instruction file (base / local). */
function InstructionEditor({
  file, scope, root, onSaved, t,
}: {
  file: EditableInstructionFile
  scope: Scope
  root: string | undefined
  onSaved: (files: InstructionsResponse, message: string) => void
  t: InstructionsTranslate
}) {
  const [draft, setDraft] = useState(file.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  // Re-sync the draft when the file identity or its on-disk content changes.
  useEffect(() => { setDraft(file.content) }, [file.path, file.content])
  const dirty = draft !== file.content
  const title = file.kind === 'base'
    ? 'AGENTS.md'
    : t('file.localTitle', { name: 'AGENTS.local.md' })
  return (
    <div className={css.card}>
      <div className={css.cardHeader}>
        <h3 className={css.cardTitle}>{title}</h3>
        <span className={styles.pathNote}>{file.path}</span>
        {!file.exists && <span className={styles.hint}>{t('file.notCreated')}</span>}
        {file.truncated && <span className={styles.error}>{t('file.tooLarge')}</span>}
      </div>
      <div className={css.cardBody}>
        <textarea
          className={css.editor}
          aria-label={title}
          value={draft}
          spellCheck={false}
          placeholder={file.kind === 'base' ? t('editor.placeholder.base') : t('editor.placeholder.local')}
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
                  onSaved(files, file.exists ? t('toast.saved') : t('toast.created', { title }))
                },
                (err: unknown) => {
                  setSaving(false)
                  setError(String(err))
                },
              )
            }}
          >
            {saving ? t('action.saving') : file.exists ? t('action.save') : t('action.create')}
          </Button>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => { setDraft(file.content) }}>
              {t('action.revert')}
            </Button>
          )}
          {error !== undefined && <span className={styles.error}>{error}</span>}
        </div>
      </div>
    </div>
  )
}

/** Read-only disclosure for a CLAUDE.md companion. */
function ClaudeCard({ file, t }: { file: InstructionFile, t: InstructionsTranslate }) {
  const title = file.kind === 'claude' ? 'CLAUDE.md' : 'CLAUDE.local.md'
  return (
    <details className={css.card}>
      <summary className={css.summary}>
        {t('claude.readonly', { title })} · <span className={styles.pathNote}>{file.path}</span>
      </summary>
      <div className={css.cardBody}>
        <pre className={css.readonly}>{file.content}</pre>
      </div>
    </details>
  )
}

/** Render the instructions page. */
export function InstructionsPage({ t }: { t: InstructionsTranslate }) {
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
      <ScopeBar scope={scope} onScope={setScope} rootsState={rootsState} root={root} onRoot={setRoot} t={t} />
      <p className={styles.hint}>
        {scope === 'personal' ? t('hint.personal') : t('hint.project')}
        {' '}{t('hint.liveEffect')}
      </p>
      {error !== undefined && <p className={styles.error}>{error}</p>}
      {data === undefined && error === undefined && <p className={css.loading}>{t('loading')}</p>}
      <div className={css.cards}>
        {writable.map((file) => (
          <InstructionEditor
            key={file.kind}
            file={file}
            scope={scope}
            root={effectiveRoot}
            t={t}
            onSaved={(files, message) => {
              setData(files)
              setToast((previous) => ({ seq: (previous?.seq ?? 0) + 1, text: message }))
            }}
          />
        ))}
        {readonly.map((file) => <ClaudeCard key={file.kind} file={file} t={t} />)}
      </div>
      {toast !== undefined && (
        <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(undefined) }} />
      )}
    </div>
  )
}
