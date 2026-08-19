export const siteConfig = {
  name: "课堂小工具",
  shortName: "课堂工具",
  seoTitle: "课堂小工具 - 智慧课堂互动与班级管理",
  description:
    "面向教师的智慧课堂互动与班级管理工具，支持随机点名、课堂计时、学生管理、任务统计、座位表、宠物积分和课堂奖励。",
  keywords: ["课堂小工具", "智慧课堂", "教师工具", "班级管理", "随机点名", "课堂计时器", "学生积分", "座位表"],
  author: "flico"
} as const;

const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || vercelProductionUrl || "http://localhost:3001");
