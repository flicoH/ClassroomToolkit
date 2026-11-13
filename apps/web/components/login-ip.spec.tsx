import { afterEach, expect, it, vi } from "vitest";
import { loginIpHeaders } from "../app/api/login-ip";
afterEach(() => vi.unstubAllEnvs());
it("forwards only the trusted ingress IP with a server-side secret", () => {
  vi.stubEnv("LOGIN_PROXY_SECRET", "secret");
  const request = new Request("http://localhost/api/login", {
    headers: { "x-real-ip": "192.0.2.1", "x-forwarded-for": "fake", "x-login-proxy-secret": "fake" }
  });
  expect(loginIpHeaders(request)).toEqual({ "x-login-proxy-secret": "secret", "x-login-client-ip": "192.0.2.1" });
  vi.stubEnv("LOGIN_PROXY_SECRET", "");
  expect(loginIpHeaders(request)).toEqual({});
});
