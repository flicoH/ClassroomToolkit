import { proxyBackendRequest } from "../backend-proxy";

/** 意见反馈只有根路径提交，使用精确路由避免部署产物对可选 catch-all 的匹配差异。 */
export function POST(request: Request) {
  return proxyBackendRequest(request, { params: Promise.resolve({}) }, "feedback");
}
