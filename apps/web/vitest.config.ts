import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Web 组件测试使用与应用相同的 @ 路径别名。 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["components/**/*.spec.tsx"]
  }
});
