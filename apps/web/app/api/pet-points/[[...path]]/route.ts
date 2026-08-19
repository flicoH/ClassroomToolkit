import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyPetPointsRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "pet-points");
}

export const GET = proxyPetPointsRequest;
export const POST = proxyPetPointsRequest;
export const PATCH = proxyPetPointsRequest;
export const DELETE = proxyPetPointsRequest;
