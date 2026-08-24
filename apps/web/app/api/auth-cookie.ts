import { NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "auth_token";
const AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function shouldUseSecureCookie(request?: Request) {
  const setting = process.env.AUTH_COOKIE_SECURE?.toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;

  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestProtocol = request ? new URL(request.url).protocol.replace(":", "") : undefined;
  return forwardedProto === "https" || requestProtocol === "https";
}

export function setAuthCookie(response: NextResponse, token: string, request?: Request) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE_SECONDS
  });
}

export function clearAuthCookie(response: NextResponse, request?: Request) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}
