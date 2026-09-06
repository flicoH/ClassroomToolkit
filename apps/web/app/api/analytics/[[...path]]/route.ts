import { proxyBackendRequest, type ProxyRouteContext } from "../../backend-proxy";
export function POST(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "analytics");
}
