/** Dashboard 仍保留独立布局入口，当前阶段直接透传页面内容。 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
