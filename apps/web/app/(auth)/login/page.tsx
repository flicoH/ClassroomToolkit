/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:42:39
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-18 23:42:39
 */

import { LoginForm } from "@/components/Login";
import { siteConfig, siteUrl } from "@/lib/site";

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "EducationalApplication",
  applicationSubCategory: "Classroom Management",
  operatingSystem: "Web",
  url: new URL("/login", siteUrl).toString(),
  description: siteConfig.description,
  inLanguage: "zh-CN",
  author: {
    "@type": "Person",
    name: siteConfig.author
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "CNY"
  }
};

/** 登录路由只负责挂载登录表单，表单逻辑集中在 LoginForm。 */
export default function LoginPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationJsonLd).replace(/</g, "\\u003c")
        }}
      />
      <LoginForm />
    </>
  );
}
