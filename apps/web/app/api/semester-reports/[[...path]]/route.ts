import { proxyBackendRequest, type ProxyRouteContext } from "../../backend-proxy";

async function handler(request: Request, context: ProxyRouteContext) {
  const { path = [] } = await context.params;
  const isClassroomPhoto = path.length === 3 && path[0] === "reports" && path[2] === "classroom-photo";
  if (isClassroomPhoto) {
    const cloned = request.clone();
    const res = await proxyBackendRequest(request, context, "semester-reports");
    if (res.status === 404) {
      return proxyBackendRequest(cloned, context, "subject-reports");
    }
    return res;
  }
  return proxyBackendRequest(request, context, "semester-reports");
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
