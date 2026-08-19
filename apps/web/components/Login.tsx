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
import request from "@/lib/request";
import type { User } from "@/types";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { GraduationCap, Loader2 } from "lucide-react";

export const LoginForm = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUesrname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const resetForm = () => {
    setUesrname("");
    setPassword("");
    setConfirmPassword("");
    setName("");
    setEmail("");
  };

  const switchMode = () => {
    setMode(current => (current === "login" ? "register" : "login"));
    resetForm();
  };

  /** 提交登录/注册表单，token 由服务端写入 HttpOnly Cookie。 */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (mode === "register" && password.length < 6) {
      toast.error("密码至少需要 6 位");
      return;
    }
    setLoading(true);
    try {
      const data = await request.post<unknown, User>(
        mode === "login" ? "/api/login" : "/api/register",
        mode === "login"
          ? {
              username,
              password
            }
          : {
              username,
              password,
              name: name.trim() || username.trim(),
              email: email.trim() || undefined
            }
      );
      setUser(data);
      toast.success(mode === "login" ? "登录成功" : "注册成功");
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
        <h1 className="text-2xl font-bold leading-tight">{mode === "login" ? "课堂小工具" : "注册教师账号"}</h1>
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
          {mode === "register" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">教师姓名</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="请输入教师姓名"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="可选"
                  disabled={loading}
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              minLength={mode === "register" ? 6 : undefined}
              disabled={loading}
            />
          </div>
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
                required
                minLength={6}
                disabled={loading}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? (mode === "login" ? "登录中..." : "注册中...") : mode === "login" ? "登录" : "注册并登录"}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? "没有账号？" : "已有账号？"}
          <button
            type="button"
            className="text-primary underline underline-offset-2 hover:no-underline"
            onClick={switchMode}
            disabled={loading}
          >
            {mode === "login" ? "注册" : "返回登录"}
          </button>
        </p>
      </CardFooter>
    </Card>
  );
};
