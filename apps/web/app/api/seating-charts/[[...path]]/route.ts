import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxySeatingChartsRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "seating-charts");
}

export const GET = proxySeatingChartsRequest;
export const POST = proxySeatingChartsRequest;
export const PATCH = proxySeatingChartsRequest;
