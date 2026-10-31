export const BLOCKED_LOGIN_MESSAGE = "禁止账号登录，请联系管理员解封";
/** 跳转原因留到登录页显示，避免跳转时 toast 丢失和并发请求重复提示。 */
export function exitBlockedSession() {
  sessionStorage.setItem("ip-login-blocked", "1");
  localStorage.removeItem("auth-storage");
  window.location.replace("/login");
}
