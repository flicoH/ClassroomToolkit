import { proxyBackendRequest, type ProxyRouteContext } from "../../backend-proxy";
export function GET(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "auth/teacher");
}
