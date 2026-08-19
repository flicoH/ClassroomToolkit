import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyTaskStatsRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "task-stats");
}

export const GET = proxyTaskStatsRequest;
export const POST = proxyTaskStatsRequest;
export const PATCH = proxyTaskStatsRequest;
export const DELETE = proxyTaskStatsRequest;
