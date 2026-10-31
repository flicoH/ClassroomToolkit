import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
/** 规范化等价 IPv6 和 IPv4 映射地址，避免换一种写法绕过封禁。 */
export function normalizeIp(value: unknown): string | null {
  if (typeof value !== 'string' || !isIP(value.trim()) || value.includes('%'))
    return null;
  const ip = value.trim().toLowerCase();
  if (isIP(ip) === 4) return ip;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const n = parseInt(mapped[1]!, 16) * 65536 + parseInt(mapped[2]!, 16);
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');
}
/** 仅持有共享密钥的 Web BFF 可声明来源 IP；普通直连请求忽略转发头。 */
export function loginIp(req: Request): string {
  const secret = process.env.LOGIN_PROXY_SECRET;
  const supplied = req.headers['x-login-proxy-secret'];
  if (
    secret &&
    typeof supplied === 'string' &&
    Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  ) {
    return normalizeIp(req.headers['x-login-client-ip']) ?? 'unknown';
  }
  return normalizeIp(req.socket.remoteAddress) ?? 'unknown';
}
