import { NextRequest, NextResponse } from "next/server";

const TOKEN_KEY = "auth_token";
const authRoutes = new Set(["/login"]);
const publicSeoRoutes = new Set(["/icon", "/opengraph-image"]);

/**
 * Web 端访问守卫：
 * - 未登录访问业务页面时跳转到登录页；
 * - 已登录访问登录页时跳回首页，避免重复登录。
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_KEY)?.value;
  const isAuthRoute = authRoutes.has(pathname);
  const isPublicRoute = isAuthRoute || publicSeoRoutes.has(pathname);

  if (!token && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && isAuthRoute) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
