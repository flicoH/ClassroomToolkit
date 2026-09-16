import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyWhiteboardsRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "whiteboards");
}

export const GET = proxyWhiteboardsRequest;
export const POST = proxyWhiteboardsRequest;
export const PATCH = proxyWhiteboardsRequest;
export const DELETE = proxyWhiteboardsRequest;
