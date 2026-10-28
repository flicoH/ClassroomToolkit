/** Resolve the backend from the running server's environment, not the build environment. */
export function getBackendUrl() {
  const url = process.env["BACKEND_URL"];
  if (url) return url.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_URL must be set in the running web container");
  }
  return (process.env["NEXT_PUBLIC_BACKEND_URL"] || "http://127.0.0.1:3000").replace(/\/$/, "");
}
