import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyRandomPickerRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "random-picker");
}

export const GET = proxyRandomPickerRequest;
export const POST = proxyRandomPickerRequest;
