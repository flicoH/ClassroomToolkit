import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, clearAuthCookie } from "../auth-cookie";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3000";

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    await fetch(`${BACKEND_URL}/auth/teacher/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}"
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ loggedOut: true });
  clearAuthCookie(response, request);
  return response;
}
