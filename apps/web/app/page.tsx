// Root landing — the real marketing page lands in step 03-01.
// For now this is a smoke target so `pnpm dev` boots cleanly.

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>pet-trainer</h1>
        <p style={{ color: '#9ca3af', marginBottom: 24 }}>
          Terminal Tamagotchi that gamifies learning Claude Code. Landing page proper lands in
          Sprint 3 (step 03-01).
        </p>
        <ul style={{ color: '#d1d5db', lineHeight: 1.8 }}>
          <li>
            <code>/auth/cli?code=&lt;uuid&gt;</code> — CLI device authorization page
          </li>
          <li>
            <code>/auth/cli/success</code> — post-authorization landing
          </li>
          <li>
            <code>/api/v1/events</code> — Edge hook ingest endpoint
          </li>
          <li>
            <code>/api/v1/auth/cli/start</code> · <code>/poll</code> — device-code OAuth API
          </li>
        </ul>
      </section>
    </main>
  )
}
