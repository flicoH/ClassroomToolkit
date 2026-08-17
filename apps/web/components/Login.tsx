/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 *  其他任何个人、公司不得使用、复制、传播、修改或商业使用。
 * **********************************************************************************************
 * @Date: 2026-04-18 23:55:27
 * @LastEditors: flicoH
 * @LastEditTime: 2026-04-19 23:16:28
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { cookieStorage } from "@/lib/cookie";
import request from "@/lib/request";
import type { User } from "@/types";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { GraduationCap, Loader2 } from "lucide-react";

export const LoginForm = () => {
  const [username, setUesrname] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  /** 提交登录表单，成功后写入全局登录态和 token。 */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await request.post<unknown, User>("/api/login", {
        username,
        password
      });
      setUser(data);
      cookieStorage.setToken(data.id);
      toast.success("登录成功");
      router.push("/");
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-95 max-w-sm backdrop-blur-md bg-white/80 dark:bg-slate-900/80 shadow-xl border border-border/50">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full bg-primary/10">
            <GraduationCap className="h-10 w-10 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">课堂小工具</CardTitle>
        {/* <CardDescription>输入您的账号信息登录系统</CardDescription> */}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={e => setUesrname(e.target.value)}
              placeholder="请输入用户名"
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-center text-sm text-muted-foreground">
          没有账号？
          {/* <Link href="/register"> */}
          <a className="text-primary underline underline-offset-2 hover:no-underline">注册</a>
          {/* </Link> */}
        </p>
      </CardFooter>
    </Card>
  );
};
