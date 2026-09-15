import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as repo from '../data/repository'
import { authenticate, MAX_ATTEMPTS } from '../domain/auth'
import { logAudit, type SimpleOutcome } from '../domain/invoiceService'
import type { AppData, Session } from '../domain/types'

export const COMPANY = {
  name: 'Apex Equipment & Supply Co.',
  address: '4550 Commerce Blvd — Cedar Falls IA 50613',
  phone: '(555) 830-2200',
}

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'warn' | 'error'
  text: string
}

interface StoreValue {
  data: AppData
  session: Session | null
  loginError: string | null
  attemptsLeft: number
  storageWarning: string | null
  toasts: Toast[]
  /** Apply a service result: commit on success, toast the message on failure. */
  apply: (outcome: SimpleOutcome, successText?: string) => boolean
  commit: (next: AppData) => void
  notify: (kind: Toast['kind'], text: string) => void
  dismissToast: (id: number) => void
  login: (username: string, password: string) => boolean
  logout: () => void
  resetData: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef(repo.load())
  const [data, setData] = useState<AppData>(initial.current.data)
  const [session, setSession] = useState<Session | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.current.warning ?? null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  useEffect(() => {
    if (initial.current.warning) repo.quarantine()
  }, [])

  // Persist on every committed change. Small dataset, so a full write is fine
  // and it keeps "what is on screen" and "what is stored" in step.
  useEffect(() => {
    repo.save(data)
  }, [data])

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, kind, text }])
    if (kind !== 'error') {
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
    }
  }, [])

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const commit = useCallback((next: AppData) => setData(next), [])

  const apply = useCallback(
    (outcome: SimpleOutcome, successText?: string) => {
      if (outcome.ok) {
        setData(outcome.data)
        if (successText) notify('success', successText)
        return true
      }
      notify('error', outcome.message)
      return false
    },
    [notify],
  )

  const login = useCallback(
    (username: string, password: string) => {
      const result = authenticate(data, username, password)
      if (result.ok) {
        setSession(result.session)
        setLoginError(null)
        setAttempts(0)
        setData((d) =>
          logAudit(d, result.session, 'AUTH_LOGIN', `${result.session.fullName} signed in as ${result.session.role}`),
        )
        return true
      }

      const used = attempts + 1
      setAttempts(used)
      setData((d) =>
        logAudit(
          d,
          { username: username.trim().toUpperCase() || '(blank)', fullName: '', role: 'CLERK' },
          'AUTH_LOGIN_FAILED',
          `${result.message} (attempt ${used} of ${MAX_ATTEMPTS})`,
        ),
      )
      setLoginError(
        used >= MAX_ATTEMPTS
          ? 'Too many failed attempts. Call Apex IT (ext 204).'
          : `${result.message} (${used} of ${MAX_ATTEMPTS})`,
      )
      return false
    },
    [attempts, data],
  )

  const logout = useCallback(() => {
    if (session) setData((d) => logAudit(d, session, 'AUTH_LOGOUT', `${session.username} signed out`))
    setSession(null)
    setLoginError(null)
    setAttempts(0)
  }, [session])

  const resetData = useCallback(() => {
    setData(repo.reset())
    setSession(null)
    setStorageWarning(null)
    notify('info', 'Data reset to the seeded state.')
  }, [notify])

  const value = useMemo<StoreValue>(
    () => ({
      data,
      session,
      loginError,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
      storageWarning,
      toasts,
      apply,
      commit,
      notify,
      dismissToast,
      login,
      logout,
      resetData,
    }),
    [data, session, loginError, attempts, storageWarning, toasts, apply, commit, notify, dismissToast, login, logout, resetData],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

/** The signed-in session. Only call this from inside an authenticated screen. */
export function useSession(): Session {
  const { session } = useStore()
  if (!session) throw new Error('No active session')
  return session
}
