import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyCountdownRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "countdown");
}

export const GET = proxyCountdownRequest;
export const POST = proxyCountdownRequest;
export const PATCH = proxyCountdownRequest;
