/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播或修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-19
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19
 */
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { cookieStorage } from "./cookie";
import toast from "react-hot-toast";
import { useRequestLoadingStore } from "@/store/requestLoadingStore";

const requestInstance = axios.create({
  // 认证 token 只存在于 HttpOnly Cookie，浏览器请求必须经过同源 Next BFF。
  baseURL: "",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

const DEDUPE_KEEP_ALIVE_MS = 600;
const dedupedRequests = new Map<string, { promise: Promise<unknown>; timer?: ReturnType<typeof setTimeout> }>();

function isAuthSubmitUrl(url = "") {
  return url.includes("/api/login") || url.includes("/api/register");
}

function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return value.toString();
  if (typeof FormData !== "undefined" && value instanceof FormData) return "[form-data]";
  if (seen.has(value)) return "[circular]";

  seen.add(value);
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item, seen)).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map(key => `${key}:${stableStringify((value as Record<string, unknown>)[key], seen)}`)
    .join(",")}}`;
}

function createRequestKey(config: AxiosRequestConfig) {
  const method = (config.method || "GET").toUpperCase();
  return [
    method,
    config.baseURL || "",
    config.url || "",
    stableStringify(config.params),
    stableStringify(config.data)
  ].join("|");
}

function sendDedupedRequest<T = unknown, R = AxiosResponse<T>, D = unknown>(config: AxiosRequestConfig<D>) {
  const key = createRequestKey(config);
  const cached = dedupedRequests.get(key);
  if (cached) return cached.promise as Promise<R>;

  const promise = requestInstance.request<T, R, D>(config).finally(() => {
    const entry = dedupedRequests.get(key);
    if (entry?.promise !== promise) return;
    entry.timer = setTimeout(() => {
      if (dedupedRequests.get(key)?.promise === promise) dedupedRequests.delete(key);
    }, DEDUPE_KEEP_ALIVE_MS);
  });
  dedupedRequests.set(key, { promise });
  return promise;
}

function requestWithDedupe<T = unknown, R = AxiosResponse<T>, D = unknown>(
  configOrUrl: string | AxiosRequestConfig<D>,
  config?: AxiosRequestConfig<D>
) {
  return sendDedupedRequest<T, R, D>(typeof configOrUrl === "string" ? { ...config, url: configOrUrl } : configOrUrl);
}

function createMethodWithoutData(method: string) {
  return <T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, config?: AxiosRequestConfig<D>) =>
    sendDedupedRequest<T, R, D>({ ...config, method, url });
}

function createMethodWithData(method: string) {
  return <T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>) =>
    sendDedupedRequest<T, R, D>({ ...config, method, url, data });
}

function startGlobalLoading(config: InternalAxiosRequestConfig) {
  useRequestLoadingStore.getState().startRequest();
  return config;
}

function endGlobalLoading() {
  useRequestLoadingStore.getState().endRequest();
}

requestInstance.interceptors.request.use(startGlobalLoading, error => {
  endGlobalLoading();
  return Promise.reject(error);
});

// 响应拦截器：业务层直接拿 response.data，错误提示也在这里集中处理。
requestInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    endGlobalLoading();
    return response.data;
  },
  (error: AxiosError<{ message?: string }>) => {
    endGlobalLoading();
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message || "请求失败";

    switch (status) {
      case 401:
        // 登录页提交账号密码失败时，只把错误交给表单提示，不做页面跳转。
        if (isAuthSubmitUrl(error.config?.url)) {
          return Promise.reject(new Error(message));
        }
        toast.error("登录已过期，请重新登录");
        void fetch("/api/logout", { method: "POST", keepalive: true });
        cookieStorage.clearAll();
        localStorage.removeItem("auth-storage");
        window.location.href = "/login";
        break;
      case 403:
        toast.error("没有权限访问");
        break;
      case 404:
        toast.error("请求资源不存在");
        break;
      case 500:
        toast.error("服务器内部错误");
        break;
      default:
        if (isAuthSubmitUrl(error.config?.url)) {
          return Promise.reject(new Error(message));
        }
        toast.error(message);
    }

    return Promise.reject(error);
  }
);

const request = Object.assign(requestWithDedupe, requestInstance, {
  request: requestWithDedupe,
  get: createMethodWithoutData("GET"),
  delete: createMethodWithoutData("DELETE"),
  head: createMethodWithoutData("HEAD"),
  options: createMethodWithoutData("OPTIONS"),
  post: createMethodWithData("POST"),
  put: createMethodWithData("PUT"),
  patch: createMethodWithData("PATCH")
}) as typeof requestInstance;

export default request;
