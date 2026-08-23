/*
 * @Author: huangqinjia huangqinjia
 * @Date: 2026-04-21 12:03:58
 * @LastEditors: flicoH
 * @LastEditTime: 2026-08-23 11:23:24
 * @FilePath: /ClassroomToolkit/apps/web/next.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

/** Next.js 应用配置；允许本机和当前局域网地址加载开发模式资源。 */
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.177", "119.23.147.212"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]
      },
      {
        source: "/dashboard",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:3000/:path*" // 注意去掉 /api
      }
    ];
  },
  turbopack: {
    root: path.resolve(appDirectory, "../..")
  }
};

export default nextConfig;
