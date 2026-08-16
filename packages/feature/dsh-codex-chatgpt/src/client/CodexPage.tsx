/**
 * Codex settings section: account sign-in via the host-side PKCE
 * flow (one click opens the authorize URL in a new tab, the page polls the
 * attempt state), the live backend model list with per-model visibility
 * toggles.
 * Every mutation goes through the plugin's own loopback routes; the section
 * re-reads status after each one.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { api } from './api.ts'
import type { NS } from './locales.ts'
import type { CodexModelView } from '../shared.ts'
import styles from './CodexPage.module.css'

/** Props delivered by the slot registration (`locale: NS`). */
export type CodexPageProps = PropsLocale<typeof NS>

/** Format a token count compactly for the model rows. */
function formatTokens(value: number): string {
  return value >= 1000 ? `${String(Math.round(value / 1000))}k` : String(value)
}

/** One-shot async action state shared by the cards. */
interface ActionState {
  busy: boolean
  error?: string
  notice?: string
}

const IDLE: ActionState = { busy: false }

/**
 * Render the Codex settings section body.
 * @param props - the locale share from the slot registration.
 * @returns the section content.
 */
export function CodexPage({ t }: CodexPageProps): ReactNode {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [signedIn, setSignedIn] = useState(false)
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [tokenExpiry, setTokenExpiry] = useState<number | undefined>(undefined)
  const [loginState, setLoginState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  const [loginError, setLoginError] = useState<string | undefined>(undefined)
  const [loginAccount, setLoginAccount] = useState<string | undefined>(undefined)
  const [models, setModels] = useState<CodexModelView[] | undefined>(undefined)
  const [modelsError, setModelsError] = useState<string | undefined>(undefined)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [allEnabled, setAllEnabled] = useState(true)
  const [modelAction, setModelAction] = useState<ActionState>(IDLE)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const stopPolling = (): void => {
    if (pollRef.current !== undefined) {
      clearInterval(pollRef.current)
      pollRef.current = undefined
    }
  }
  useEffect(() => stopPolling, [])

  const loadModels = useCallback(async (): Promise<void> => {
    setModelsLoading(true)
    setModelsError(undefined)
    try {
      const response = await api.models()
      setModels(response.models)
    } catch (error) {
      setModels(undefined)
      setModelsError((error as Error).message)
    } finally {
      setModelsLoading(false)
    }
  }, [])

  const load = useCallback(async (): Promise<void> => {
    try {
      const [status, stored] = await Promise.all([api.status(), api.settings()])
      setSignedIn(status.auth.configured)
      setAccountId(status.auth.accountId)
      setTokenExpiry(status.auth.accessTokenExpiresAtMs)
      setLoginState(status.login.state)
      setLoginError(status.login.error)
      setLoginAccount(status.login.accountId)
      setAllEnabled(stored.values.enabledModels === undefined)
      setChecked(new Set(stored.values.enabledModels ?? []))
      setLoadError(undefined)
    } catch (error) {
      setLoadError((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Fetch the model list once the account is known to be signed in.
  useEffect(() => {
    if (signedIn) void loadModels()
  }, [signedIn, loadModels])

  // While a login attempt waits for its browser callback, poll its state.
  useEffect(() => {
    if (loginState !== 'pending') return
    stopPolling()
    pollRef.current = setInterval(() => {
      void api.loginState().then((report) => {
        if (report.state === 'pending') return
        stopPolling()
        setLoginState(report.state)
        setLoginError(report.error)
        setLoginAccount(report.accountId)
        if (report.state === 'done') void load()
      }, () => undefined)
    }, 1_500)
    return stopPolling
  }, [loginState, load])

  const startLogin = async (): Promise<void> => {
    setLoginError(undefined)
    try {
      const started = await api.loginStart()
      window.open(started.url, '_blank', 'noopener')
      setLoginState('pending')
    } catch (error) {
      setLoginState('error')
      setLoginError((error as Error).message)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await api.logout()
      setModels(undefined)
      await load()
    } catch (error) {
      setLoadError((error as Error).message)
    }
  }

  const toggleModel = (id: string): void => {
    setAllEnabled(false)
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const enableAll = (): void => {
    setAllEnabled(true)
    setChecked(new Set((models ?? []).map(model => model.id)))
  }

  const saveModels = async (): Promise<void> => {
    setModelAction({ busy: true })
    try {
      await api.saveSettings(
        allEnabled ? { unset: ['enabledModels'] } : { set: { enabledModels: [...checked] } },
      )
      setModelAction({ busy: false, notice: t('models.saved') })
    } catch (error) {
      setModelAction({ busy: false, error: (error as Error).message })
    }
  }

  if (loading) return <p className={styles['hint']}>{t('models.loading')}</p>
  if (loadError !== undefined) return <p className={styles['error']}>{t('error.generic', { message: loadError })}</p>

  return (
    <div className={styles['page']}>
      <section className={styles['card']}>
        <h3 className={styles['cardTitle']}>{t('account.heading')}</h3>
        <div className={styles['statusRow']}>
          <span className={styles['dot']} data-ok={signedIn} />
          <span className={styles['statusText']}>
            {signedIn ? t('account.signedIn') : t('account.signedOut')}
          </span>
          {signedIn && accountId !== undefined
            ? <span className={styles['chip']}>{t('account.accountId', { id: accountId })}</span>
            : null}
          {signedIn && tokenExpiry !== undefined
            ? (
              <span className={styles['chip']}>
                {tokenExpiry > Date.now()
                  ? t('account.tokenExpiry', { time: new Date(tokenExpiry).toLocaleString() })
                  : t('account.tokenExpired')}
              </span>
            )
            : null}
        </div>
        <p className={styles['hint']}>{t('account.hint')}</p>
        {loginState === 'pending' ? <p className={styles['notice']}>{t('login.pending')}</p> : null}
        {loginState === 'done'
          ? (
            <p className={styles['notice']}>
              {t('login.done', { account: loginAccount === undefined ? '' : t('login.doneAccount', { id: loginAccount }) })}
            </p>
          )
          : null}
        {loginState === 'error' && loginError !== undefined
          ? <p className={styles['error']}>{t('login.failed', { message: loginError })}</p>
          : null}
        <div className={styles['actions']}>
          <button
            type="button"
            className={styles['primaryButton']}
            disabled={loginState === 'pending'}
            onClick={() => { void startLogin() }}
          >
            {loginState === 'pending' ? t('action.loginWaiting') : t('action.login')}
          </button>
          {signedIn
            ? (
              <button type="button" className={styles['secondaryButton']} onClick={() => { void logout() }}>
                {t('action.logout')}
              </button>
            )
            : null}
        </div>
      </section>

      <section className={styles['card']}>
        <div className={styles['cardHead']}>
          <h3 className={styles['cardTitle']}>{t('models.heading')}</h3>
          <div className={styles['actions']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={!signedIn || modelsLoading}
              onClick={() => { void loadModels() }}
            >
              {t('action.refresh')}
            </button>
          </div>
        </div>
        <p className={styles['hint']}>{t('models.intro')}</p>
        {!signedIn ? <p className={styles['hint']}>{t('models.loginFirst')}</p> : null}
        {signedIn && modelsLoading && models === undefined
          ? <p className={styles['hint']}>{t('models.loading')}</p>
          : null}
        {modelsError !== undefined
          ? <p className={styles['error']}>{t('models.failed', { message: modelsError })}</p>
          : null}
        {models !== undefined && models.length === 0
          ? <p className={styles['hint']}>{t('models.empty')}</p>
          : null}
        {models !== undefined && models.length > 0
          ? (
            <>
              <ul className={styles['modelList']}>
                {models.map((model) => {
                  const isChecked = allEnabled || checked.has(model.id)
                  return (
                    <li key={model.id} className={styles['modelRow']}>
                      <label className={styles['modelLabel']}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={allEnabled}
                          onChange={() => { toggleModel(model.id) }}
                        />
                        <span className={styles['modelName']}>{model.name ?? model.id}</span>
                        <span className={styles['modelId']}>{model.id}</span>
                      </label>
                      <span className={styles['modelMeta']}>
                        {model.contextWindow !== undefined
                          ? <span className={styles['chip']}>{t('models.contextWindow', { tokens: formatTokens(model.contextWindow) })}</span>
                          : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {modelAction.error !== undefined
                ? <p className={styles['error']}>{t('error.generic', { message: modelAction.error })}</p>
                : null}
              {modelAction.notice !== undefined ? <p className={styles['notice']}>{modelAction.notice}</p> : null}
              <div className={styles['actions']}>
                <button
                  type="button"
                  className={styles['primaryButton']}
                  disabled={modelAction.busy || allEnabled}
                  onClick={() => { void saveModels() }}
                >
                  {modelAction.busy ? t('action.saving') : t('action.save')}
                </button>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  disabled={modelAction.busy || allEnabled}
                  onClick={enableAll}
                >
                  {t('action.resetAll')}
                </button>
              </div>
            </>
          )
          : null}
      </section>

    </div>
  )
}
