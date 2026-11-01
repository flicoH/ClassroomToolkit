import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, clearAuthCookie } from "../auth-cookie";
import { revokeTeacherSession } from "./revoke-session";

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const response = NextResponse.json({ loggedOut: true });
  clearAuthCookie(response, request);
  if (token) await revokeTeacherSession(token);
  return response;
}
