/** 入口 Nginx 必须覆盖 X-Real-IP，且 Web 端口仅允许可信入口访问。 */
export function loginIpHeaders(request: Request): Record<string, string> {
  const secret = process.env.LOGIN_PROXY_SECRET;
  if (!secret) return {};
  return { "x-login-proxy-secret": secret, "x-login-client-ip": request.headers.get("x-real-ip") || "" };
}
