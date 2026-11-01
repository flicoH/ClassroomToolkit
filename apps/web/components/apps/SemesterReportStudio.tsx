"use client";

import { SemesterReportsV2View } from "../semester-reports-v2";

/**
 * 全新学期报告工作台（独立入口）。
 * 严格按照 sdd/feature/semester-report-ux/report-composer-prototype.html 原型 1:1 打造：
 * - 顶部 3 大主切换标签：报告管理与分发、填写与生成报告 (向导)、学期学科设置与课程资料
 * - 弹窗具备可靠关闭入口（✕、关闭按钮、点击背景、Escape 键，高层级防穿透）
 * - 加载并查看全部既有报告数据、学期、学科、学生与课程资料
 * - 保持原版【学期报告】与【学期报告v2】完全不受任何改动影响
 */
export function SemesterReportStudio() {
  return <SemesterReportsV2View />;
}
