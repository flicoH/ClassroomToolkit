/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import { proxyBackendRequest, ProxyRouteContext } from "../../backend-proxy";

async function proxyClassesRequest(request: Request, context: ProxyRouteContext) {
  return proxyBackendRequest(request, context, "classes");
}

export const GET = proxyClassesRequest;
export const POST = proxyClassesRequest;
export const PATCH = proxyClassesRequest;
export const DELETE = proxyClassesRequest;
