import assert from "node:assert/strict";
import test from "node:test";
import { checkNativeDialogs, findNativeDialogUses } from "./check-native-dialogs.mjs";

test("rejects direct and browser-object native dialogs", () => {
  const source = `alert("x"); window.confirm("x"); globalThis["prompt"]("x"); self?.alert("x")`;
  assert.deepEqual(
    findNativeDialogUses(source, "example.tsx").map(item => item.method),
    ["alert", "confirm", "prompt", "alert"]
  );
});

test("does not flag comments, strings, or application dialog components", () => {
  const source = `// window.alert("example")\nconst sample = "confirm('example')";\n<ConfirmDialog onConfirm={save} />`;
  assert.deepEqual(findNativeDialogUses(source, "example.tsx"), []);
});

test("checks Vue script and event-handler expressions", () => {
  const source = `<script setup lang="ts">\nwindow.confirm("delete")\n</script>\n<template><button @click="prompt('name')">Open</button></template>`;
  assert.deepEqual(
    findNativeDialogUses(source, "example.vue").map(item => item.line),
    [2, 4]
  );
});

test("current browser applications contain no native dialogs", async () => {
  assert.deepEqual(await checkNativeDialogs(), []);
});
