import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyFeedbackRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "feedback");
}

export const POST = proxyFeedbackRequest;
