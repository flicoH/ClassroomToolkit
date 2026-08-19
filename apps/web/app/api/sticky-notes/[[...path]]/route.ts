import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyStickyNotesRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "sticky-notes");
}

export const GET = proxyStickyNotesRequest;
export const POST = proxyStickyNotesRequest;
export const PATCH = proxyStickyNotesRequest;
export const DELETE = proxyStickyNotesRequest;
