import { proxyBackendRequest, type ProxyRouteContext } from "../../backend-proxy";

function handler(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "semester-reports");
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
