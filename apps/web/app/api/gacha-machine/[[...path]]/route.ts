import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyGachaMachineRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "gacha-machine");
}

export const GET = proxyGachaMachineRequest;
export const POST = proxyGachaMachineRequest;
export const PATCH = proxyGachaMachineRequest;
export const DELETE = proxyGachaMachineRequest;
