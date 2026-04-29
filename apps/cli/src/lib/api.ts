// Minimal HTTP client for the pet-trainer API. Node 20+ has native fetch.

export const API_BASE = process.env.PET_API_BASE ?? 'https://pet.specops.black/api/v1'

export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: T }> => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  let body: unknown = null
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { status: res.status, body: body as T }
}
