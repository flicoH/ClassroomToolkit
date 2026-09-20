import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getBackendUrl } from "../backend-url";
import { AUTH_COOKIE_NAME, clearAuthCookie } from "../auth-cookie";

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    await fetch(`${getBackendUrl()}/auth/teacher/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}"
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ loggedOut: true });
  clearAuthCookie(response, request);
  return response;
}
