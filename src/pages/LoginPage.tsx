import { useState } from 'react'
import { COMPANY, useStore } from '../state/store'
import { TextField } from '../components/ui'

export default function LoginPage() {
  const { login, loginError, attemptsLeft, storageWarning } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const lockedOut = attemptsLeft === 0

  return (
    <div className="login-shell">
      <div className="card login-card">
        <h1>{COMPANY.name}</h1>
        <p className="lede">Dealer Management System — sign in to continue.</p>

        {storageWarning && <div className="notice warn">{storageWarning}</div>}
        {loginError && <div className="notice error">{loginError}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!lockedOut) login(username, password)
          }}
        >
          <TextField label="User" value={username} onChange={(v) => setUsername(v.toUpperCase())} />
          <TextField label="Password" type="password" value={password} onChange={setPassword} />
          <button className="btn primary lg" type="submit" disabled={lockedOut} style={{ width: '100%', marginTop: 6 }}>
            {lockedOut ? 'Locked out' : 'Log in'}
          </button>
        </form>

        <div className="seed-accounts">
          <strong>Seeded accounts</strong>
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Password</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="mono">ADMIN</td><td className="mono">admin</td><td>ADMIN</td></tr>
              <tr><td className="mono">MARGE</td><td className="mono">marge2006</td><td>MANAGER</td></tr>
              <tr><td className="mono">COUNTER1</td><td className="mono">counter1</td><td>CLERK</td></tr>
              <tr><td className="mono">COUNTER2</td><td className="mono">1234</td><td>CLERK</td></tr>
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            Passwords are case-sensitive. RICK is deactivated and cannot sign in.
          </p>
        </div>
      </div>
    </div>
  )
}
