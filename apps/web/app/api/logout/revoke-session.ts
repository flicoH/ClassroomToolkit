import { getBackendUrl } from "../backend-url";

export const LOGOUT_REVOKE_TIMEOUT_MS = 1500;

/** 服务端撤销失败不能阻止浏览器清除本地会话；超时限制退出接口的最长等待。 */
export async function revokeTeacherSession(
  token: string,
  fetcher: typeof fetch = fetch,
  backendUrl: () => string = getBackendUrl,
  timeoutMs = LOGOUT_REVOKE_TIMEOUT_MS
) {
  try {
    await fetcher(`${backendUrl()}/auth/teacher/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    // Cookie 仍会清除；服务端会话最多保留到自身过期时间。
  }
}
