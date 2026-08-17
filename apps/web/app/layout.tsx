import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Background } from "@/components/Background";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "课堂小工具",
  description: "flico开发的课堂小工具,智慧教学互动工具"
};

/** 应用根布局：挂载背景、全局 Provider 和字体变量。 */
export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="w-full h-full flex items-center justify-center relative overflow-hidden">
        <Background />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
