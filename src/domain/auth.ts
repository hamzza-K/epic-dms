// Authentication — BUSINESS_RULES.md §10.
//
// Differences from frmLogin.cs, all deliberate:
//   * no SUPPORT / apex! vendor backdoor
//   * passwords compared case-sensitively (the legacy screen upper-cased both
//     sides, so "MARGE2006" opened Marge's account)
//   * deactivated accounts are refused
//   * the same message for a bad username and a bad password

import type { AppData, Session, User } from './types'

export const MAX_ATTEMPTS = 3

export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; message: string }

export function authenticate(data: AppData, username: string, password: string): AuthResult {
  const u = username.trim().toUpperCase()
  const match: User | undefined = data.users.find((x) => x.username.toUpperCase() === u)

  if (!match || match.password !== password) {
    return { ok: false, message: 'Bad user or password.' }
  }
  if (!match.active) {
    return { ok: false, message: 'That account has been deactivated. Contact an administrator.' }
  }

  return { ok: true, session: { username: match.username, fullName: match.fullName, role: match.role } }
}
