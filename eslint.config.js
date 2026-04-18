import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";

const ignores = ["**/dist/**", "**/node_modules/**", "/.*", "scripts/**", "**/*.d.ts", "**/.next/**", "**/out/**"];

export default defineConfig([
  // ESLint 推荐配置
  eslint.configs.recommended,
  // TypeScript 推荐配置
  ...tseslint.configs.recommended,
  // 通用配置
  {
    ignores,
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
    ignores,
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
    ignores,
    files: ["apps/backend/**/*.{ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  // Vue 配置 (admin)
  ...eslintPluginVue.configs["flat/recommended"].map(config => ({
    ...config,
    ignores,
    files: ["apps/admin/**/*.{vue}"],
    languageOptions: {
      ...config.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  })),
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
