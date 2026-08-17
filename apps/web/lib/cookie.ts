/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-19 00:00:29
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 00:00:30
 */
import Cookies from "js-cookie";
import type { User } from "@/types";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

/** 认证相关 cookie 封装，避免组件层直接依赖 js-cookie 的键名和序列化细节。 */
export const cookieStorage = {
  getToken: () => Cookies.get(TOKEN_KEY),
  setToken: (token: string) => {
    Cookies.set(TOKEN_KEY, token, { expires: 7, path: "/" });
  },
  removeToken: () => {
    Cookies.remove(TOKEN_KEY, { path: "/" });
  },
  getUser: () => {
    const userStr = Cookies.get(USER_KEY);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        // 历史脏数据解析失败时按未登录处理。
        return null;
      }
    }
    return null;
  },
  setUser: (user: User) => {
    Cookies.set(USER_KEY, JSON.stringify(user), { expires: 7, path: "/" });
  },
  removeUser: () => {
    Cookies.remove(USER_KEY, { path: "/" });
  },
  clearAll: () => {
    cookieStorage.removeToken();
    cookieStorage.removeUser();
  }
};
