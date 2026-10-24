'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/admin-auth'
import '../(panel)/panel.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await login(email.trim(), password)
    if (result.ok) router.replace('/panel')
    else {
      setError(result.error)
      setBusy(false)
    }
  }

  return (
    <div className="panel-login">
      <form onSubmit={submit}>
        <h1>AvoTalent Admin</h1>
        <p>Entra con tu cuenta de AvoTalent. Solo administradores.</p>
        <label>
          Correo
          <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
