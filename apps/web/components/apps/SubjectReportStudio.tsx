"use client";

import { SubjectReportStudioView } from "../subject-reports/SubjectReportStudioView";

/**
 * 全新学科报告工作台。
 * 以 semesterReportStudio 与 weekly-feedback-prototype.html 为基础，
 * 独立存储于 subject_reports，实现学科报告独立填写、生成、分发与管理。
 */
export function SubjectReportStudio() {
  return <SubjectReportStudioView />;
}
