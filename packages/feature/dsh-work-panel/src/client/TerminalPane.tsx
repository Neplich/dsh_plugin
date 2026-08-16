/**
 * The terminal tool: one xterm.js surface bound to the session's host PTY
 * over the work-panel WebSocket. The PTY and its retained scrollback live
 * host-side, so unmounting (panel close, tool switch, session hop) never
 * loses the process or its output: a fresh mount replays the buffer.
 *
 * Geometry note: the subprocess seam fixes PTY rows/cols at spawn, so the
 * xterm surface fits the panel but the shell's own wrap width stays at the
 * spawn geometry (a restart adopts the current fit). Full-screen curses
 * apps should be started after the panel reaches its working width.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { terminalSocketUrl } from './api.ts'
import type { TerminalServerFrame } from '../shared/protocol.ts'

/** Terminal-pane props, threaded from the panel root. */
export interface TerminalPaneProps {
  readonly hidden: boolean
  readonly sessionId: string
  readonly terminalId: string
  readonly labelledBy: string
  readonly panelId: string
  readonly t: PropsLocale<'workPanel'>['t']
}

type Status =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'live' }
  | { readonly kind: 'exited' }
  | { readonly kind: 'error', readonly message: string }

/** Read the xterm theme from the live dsw theme tokens (undefined members omitted for exactOptionalPropertyTypes). */
function readTheme(): Record<string, string> {
  const style = getComputedStyle(document.body)
  const read = (name: string): string | undefined => {
    const value = style.getPropertyValue(name).trim()
    return value === '' ? undefined : value
  }
  const theme: Record<string, string> = {}
  const pairs: Array<[string, string | undefined]> = [
    ['background', read('--dsw-alias-bg-base')],
    ['foreground', read('--dsw-alias-label-primary')],
    ['cursor', read('--dsw-alias-label-primary')],
    ['selectionBackground', read('--dsw-alias-bg-layer-2')],
  ]
  for (const [key, value] of pairs) {
    if (value !== undefined) theme[key] = value
  }
  return theme
}

/** The interactive terminal surface. */
export function TerminalPane({ hidden, sessionId, terminalId, labelledBy, panelId, t }: TerminalPaneProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'connecting' })
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    let disposed = false

    const term = new Terminal({
      cursorBlink: true,
      screenReaderMode: true,
      fontSize: 12,
      fontFamily: getComputedStyle(document.body).getPropertyValue('--ds-font-family-code').trim() || 'monospace',
      scrollback: 5000,
      theme: readTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const proposed = fit.proposeDimensions()
    const ws = new WebSocket(terminalSocketUrl(sessionId, terminalId, proposed?.cols ?? 120, proposed?.rows ?? 30))
    wsRef.current = ws
    setStatus({ kind: 'connecting' })

    const inputSubscription = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    ws.onmessage = (event) => {
      let frame: TerminalServerFrame
      try {
        frame = JSON.parse(String(event.data)) as TerminalServerFrame
      } catch {
        return
      }
      switch (frame.type) {
        case 'ready':
          setStatus(frame.exited ? { kind: 'exited' } : { kind: 'live' })
          break
        case 'replay':
        case 'data':
          term.write(frame.data)
          break
        case 'reset':
          term.reset()
          setStatus({ kind: 'live' })
          break
        case 'exit':
          setStatus({ kind: 'exited' })
          break
        case 'error':
          setStatus({ kind: 'error', message: frame.message })
          break
      }
    }
    ws.onclose = () => {
      if (disposed) return
      setStatus((current) => (current.kind === 'exited' ? current : { kind: 'error', message: 'disconnected' }))
    }

    // Follow the shell theme: the presenter rewrites body tokens on theme
    // changes, so re-read them into the live terminal.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = readTheme()
    })
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-ds-dark-theme', 'style'],
    })

    // Refit when the pane's box changes (panel drag, maximize); hidden panes
    // have a zero box and refit on becoming visible instead.
    const resizeObserver = new ResizeObserver(() => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
    })
    resizeObserver.observe(host)

    return () => {
      disposed = true
      themeObserver.disconnect()
      resizeObserver.disconnect()
      inputSubscription.dispose()
      // The PTY survives: only this browser view detaches.
      ws.close()
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [sessionId, terminalId, epoch])

  // Becoming visible after a hidden stretch: the box now has real size.
  useEffect(() => {
    if (!hidden) fitRef.current?.fit()
  }, [hidden])

  const restart = (): void => {
    const fit = fitRef.current
    fit?.fit()
    const dims = fit?.proposeDimensions()
    const ws = wsRef.current
    if (ws !== null && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'restart', cols: dims?.cols ?? 120, rows: dims?.rows ?? 30 }))
      setStatus({ kind: 'connecting' })
    } else {
      setEpoch(e => e + 1)
    }
  }

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={hidden}
      className={hidden ? 'dshwp-hidden' : 'dshwp-terminal'}
    >
      <div ref={hostRef} className="dshwp-termhost" />
      {status.kind === 'connecting' && (
        <div className="dshwp-termbar"><span className="dshwp-termbarText">{t('terminal.connecting')}</span></div>
      )}
      {status.kind === 'exited' && (
        <div className="dshwp-termbar">
          <span className="dshwp-termbarText">{t('terminal.exited')}</span>
          <button type="button" className="dshwp-termbarBtn" onClick={restart}>{t('terminal.restart')}</button>
        </div>
      )}
      {status.kind === 'error' && (
        <div className="dshwp-termbar">
          <span className="dshwp-termbarText">
            {status.message === 'disconnected' ? t('terminal.disconnected') : `${t('terminal.error')}: ${status.message}`}
          </span>
          <button type="button" className="dshwp-termbarBtn" onClick={restart}>{t('terminal.reconnect')}</button>
        </div>
      )}
    </div>
  )
}
