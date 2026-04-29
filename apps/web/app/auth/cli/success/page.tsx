// SPEC.md §6.1 — terminal post-authorization landing page.
// No client interaction needed; the CLI is polling /api/v1/auth/cli/poll
// and will pick up the session within seconds.

export default function AuthCliSuccessPage() {
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
      <section style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>You&apos;re connected.</h1>
        <p style={{ color: '#9ca3af' }}>
          Return to your terminal — the CLI will pick up the session automatically.
        </p>
      </section>
    </main>
  )
}
