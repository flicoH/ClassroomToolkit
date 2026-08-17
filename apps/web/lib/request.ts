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
import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from "axios";
import { cookieStorage } from "./cookie";
import toast from "react-hot-toast";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

// 请求拦截器：从 cookie 注入 token，后端接口统一通过 Authorization 识别用户。
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = cookieStorage.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

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
        toast.error("登录已过期，请重新登录");
        cookieStorage.clearAll();
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
        toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default request;
