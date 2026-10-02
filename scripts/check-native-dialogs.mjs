import { readdir, readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const nativeMethods = new Set(["alert", "confirm", "prompt"]);
const browserRoots = new Set(["window", "globalThis", "self"]);
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".vue"]);
const ignoredDirectories = new Set(["node_modules", ".next", "dist", "build", "coverage"]);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function isBrowserRoot(node) {
  return (
    (ts.isIdentifier(node) && browserRoots.has(node.text)) ||
    (ts.isPropertyAccessExpression(node) && node.name.text === "window" && isBrowserRoot(node.expression))
  );
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression))
    return node.argumentExpression.text;
  return null;
}

function codeSegments(source, filePath) {
  if (extname(filePath) !== ".vue") return [{ code: source, offset: 0 }];
  const segments = [];
  // Vue templates can invoke methods directly from event attributes, so parse those as expressions too.
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    segments.push({ code: match[1], offset: match.index + match[0].indexOf(match[1]) });
  }
  for (const match of source.matchAll(/(?:@|v-on:)[\w.-]+\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    segments.push({ code: match[2], offset: match.index + match[0].indexOf(match[2]) });
  }
  return segments;
}

/** Find actual JavaScript calls or references without mistaking strings and comments for code. */
export function findNativeDialogUses(source, filePath) {
  const violations = [];
  for (const { code, offset } of codeSegments(source, filePath)) {
    const syntax = /\.[jt]sx$/u.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const tree = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, syntax);
    const lineOffset = source.slice(0, offset).split("\n").length - 1;
    function visit(node) {
      const method = memberName(node);
      const isNativeMember = method && nativeMethods.has(method) && isBrowserRoot(node.expression);
      const isBareCall =
        ts.isCallExpression(node) && ts.isIdentifier(node.expression) && nativeMethods.has(node.expression.text);
      if (isNativeMember || isBareCall) {
        const position = tree.getLineAndCharacterOfPosition(node.getStart(tree));
        violations.push({
          line: lineOffset + position.line + 1,
          method: isNativeMember ? method : node.expression.text
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return violations;
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name))
      files.push(...(await sourceFiles(join(directory, entry.name))));
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name)) && !entry.name.endsWith(".d.ts"))
      files.push(join(directory, entry.name));
  }
  return files;
}

/** Check all browser application source; return diagnostics for CI and local verification. */
export async function checkNativeDialogs(root = repositoryRoot) {
  const diagnostics = [];
  for (const app of ["web", "admin"]) {
    for (const file of await sourceFiles(join(root, "apps", app))) {
      const source = await readFile(file, "utf8");
      for (const violation of findNativeDialogUses(source, file))
        diagnostics.push(`${file}:${violation.line}: 禁止浏览器原生 ${violation.method}，请使用站内弹窗或状态提示`);
    }
  }
  return diagnostics;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const diagnostics = await checkNativeDialogs();
  if (diagnostics.length) {
    console.error(diagnostics.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Web/Admin 未使用浏览器原生弹窗");
  }
}
