'use client'

// SPEC.md §6.1 — browser-facing device authorization page.
// Renders the device code and a "Connect with GitHub" button that triggers
// Supabase OAuth. The redirect target points back at /auth/cli/callback with
// the device_code preserved so the callback can correlate the session.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

let _supabase: SupabaseClient | null = null
const getSupabase = (): SupabaseClient => {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local'
    )
  }
  _supabase = createClient(url, key)
  return _supabase
}

export default function CliAuthPage() {
  const params = useSearchParams()
  const deviceCode = params.get('code') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleAuthorize = async () => {
    if (!deviceCode) {
      setError('Missing device code in URL')
      return
    }
    setBusy(true)
    setError(null)
    const redirectBase =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    try {
      const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${redirectBase}/auth/cli/callback?device_code=${encodeURIComponent(deviceCode)}`,
        },
      })
      if (oauthError) {
        setBusy(false)
        setError(oauthError.message)
      }
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'unknown error')
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#0b0d10',
        color: '#e5e7eb',
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 480, width: '100%' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>pet-trainer · authorize CLI</h1>
        <p style={{ color: '#9ca3af', marginBottom: 24 }}>
          Confirm the device code below matches what your terminal is showing, then connect with
          GitHub to authorize the CLI.
        </p>

        <div
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Device code</div>
          <code style={{ fontSize: 16, wordBreak: 'break-all' }}>
            {deviceCode || '— no code in URL —'}
          </code>
        </div>

        <button
          type="button"
          onClick={handleAuthorize}
          disabled={busy || !deviceCode}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: 'none',
            background: busy ? '#374151' : '#22c55e',
            color: '#0b0d10',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Redirecting…' : 'Connect with GitHub'}
        </button>

        {error && (
          <p role="alert" style={{ marginTop: 16, color: '#f87171' }}>
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
