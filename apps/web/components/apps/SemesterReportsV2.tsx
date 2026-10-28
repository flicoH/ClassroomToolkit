"use client";
import { SemesterReports } from "./SemesterReports";
/** v2 仅指定版本入口；生成、编辑和分享复用主组件，避免两套流程的权限与保存规则分叉。 */
export function SemesterReportsV2() {
  return <SemesterReports version="v2" />;
}
