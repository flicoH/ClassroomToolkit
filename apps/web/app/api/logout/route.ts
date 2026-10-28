import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getBackendUrl } from "../backend-url";
import { AUTH_COOKIE_NAME, clearAuthCookie } from "../auth-cookie";

const LOGOUT_REVOKE_TIMEOUT_MS = 1500;

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

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const response = NextResponse.json({ loggedOut: true });
  clearAuthCookie(response, request);
  if (token) await revokeTeacherSession(token);
  return response;
}
