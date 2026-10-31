import { normalizeIp } from './login-ip';
const cache = new Map<string, { value: string; until: number }>();
/** 限时查询并缓存；地理服务失败不阻断登录，所在地仅供参考。 */
export async function ipLocation(value: string): Promise<string> {
  const ip = normalizeIp(value);
  if (!ip) return '未知';
  if (
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ||
    ip === '::1' ||
    /^(fc|fd|fe[89ab])/.test(ip) ||
    ip === '::'
  )
    return '本地 / 内网';
  const hit = cache.get(ip);
  if (hit && hit.until > Date.now()) return hit.value;
  let location = '未知';
  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,region,city`,
      { signal: AbortSignal.timeout(1500) },
    );
    const data = (await response.json()) as Record<string, unknown>;
    if (response.ok && data.success === true)
      location =
        [
          ...new Set(
            [data.country, data.region, data.city].filter(
              (v): v is string => typeof v === 'string' && !!v,
            ),
          ),
        ]
          .join(' / ')
          .slice(0, 255) || '未知';
  } catch {
    /* 查询失败保留未知，不影响认证。 */
  }
  if (cache.size >= 2000) cache.clear();
  cache.set(ip, {
    value: location,
    until: Date.now() + (location === '未知' ? 60000 : 86400000),
  });
  return location;
}
