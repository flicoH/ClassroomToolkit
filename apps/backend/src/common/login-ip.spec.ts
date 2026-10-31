import { loginIp, normalizeIp } from './login-ip';
import type { Request } from 'express';
describe('login IP boundary', () => {
  afterEach(() => {
    delete process.env.LOGIN_PROXY_SECRET;
  });
  it('normalizes equivalent addresses and rejects invalid values', () => {
    expect(normalizeIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(normalizeIp('2001:0DB8:0:0::1')).toBe('2001:db8::1');
    expect(normalizeIp('1.2.3.999')).toBeNull();
    expect(normalizeIp('192.0.2.1/24')).toBeNull();
  });
  it('ignores untrusted headers and accepts authenticated proxy headers', () => {
    const req = {
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: {
        'x-login-client-ip': '192.0.2.1',
        'x-login-proxy-secret': 'wrong',
      },
    } as unknown as Request;
    process.env.LOGIN_PROXY_SECRET = 'secret';
    expect(loginIp(req)).toBe('127.0.0.1');
    req.headers['x-login-proxy-secret'] = 'secret';
    expect(loginIp(req)).toBe('192.0.2.1');
  });
});
