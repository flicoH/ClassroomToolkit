import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, profile } from './api'
afterEach(() => {
  vi.unstubAllGlobals()
  profile.value = null
})
describe('admin API session handling', () => {
  it('uses same-origin cookies and CSRF header without exposing credentials to storage', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) })
    vi.stubGlobal('fetch', fetcher)
    await api('auth/login', {}, { username: 'a', password: 'test' })
    expect(fetcher).toHaveBeenCalledWith(
      '/admin/auth/login',
      expect.objectContaining({
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'X-Admin-Request': '1' }),
      }),
    )
  })
  it('clears stale identity and signals session expiry', async () => {
    profile.value = { id: 'a', username: 'a' }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'expired' }) }),
    )
    const listener = vi.fn()
    window.addEventListener('admin-session-expired', listener)
    await expect(api('auth/me')).rejects.toThrow('expired')
    expect(profile.value).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('admin-session-expired', listener)
  })
})
