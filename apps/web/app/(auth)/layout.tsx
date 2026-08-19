/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:42:49
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 02:08:47
 */
import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: siteConfig.seoTitle
  },
  description: siteConfig.description,
  alternates: {
    canonical: "/login",
    languages: {
      "zh-CN": "/login"
    }
  },
  robots: {
    index: true,
    follow: true,
    noarchive: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "/login",
    siteName: siteConfig.name,
    title: siteConfig.seoTitle,
    description: siteConfig.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: siteConfig.name }]
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.seoTitle,
    description: siteConfig.description,
    images: ["/opengraph-image"]
  }
};

/** 认证页布局：让登录卡片居中显示在桌面背景之上。 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center backdrop-blur-xs">{children}</div>;
}
