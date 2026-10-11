/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 21:28:36
 * @LastEditors: flicoH
 * @LastEditTime: 2026-09-06 17:11:36
 */
import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";

// Global ignores exclude generated output, not source tests or verification scripts.
const ignores = [
  "**/dist/**",
  "**/.dev-dist/**",
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/out/**",
  "**/build/**",
  "**/coverage/**",
  "**/next-env.d.ts"
];

export default defineConfig([
  { ignores },
  // ESLint 推荐配置
  eslint.configs.recommended,
  // TypeScript 推荐配置
  ...tseslint.configs.recommended,
  // 通用配置
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-var": "error"
    }
  },
  // Next.js (web) 配置
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  // NestJS (backend) 配置
  {
    files: ["apps/backend/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  // Vue 配置 (admin)
  ...eslintPluginVue.configs["flat/recommended"].map(config => ({
    ...config,
    files: ["apps/admin/**/*.vue"],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: { ...config.languageOptions?.parserOptions, parser: tseslint.parser },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  })),
  // PM2 and other .cjs configs are deliberately CommonJS; keep other rules active.
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" }
  },
  // 根目录配置文件
  {
    files: ["*.config.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
]);
