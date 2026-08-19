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
import axios, { AxiosError, AxiosResponse } from "axios";
import { cookieStorage } from "./cookie";
import toast from "react-hot-toast";

const request = axios.create({
  // 认证 token 只存在于 HttpOnly Cookie，浏览器请求必须经过同源 Next BFF。
  baseURL: "",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

function isAuthSubmitUrl(url = "") {
  return url.includes("/api/login") || url.includes("/api/register");
}

// 响应拦截器：业务层直接拿 response.data，错误提示也在这里集中处理。
request.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error: AxiosError<{ message?: string }>) => {
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

export default request;
