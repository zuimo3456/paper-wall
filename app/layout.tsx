import type { Metadata } from "next";
import "./globals.css";
import "./paper-motion.css";

export const metadata: Metadata = {
  title: "纸上 · 我的事项墙",
  description: "把待办和计划贴上墙，给每件事一点进展。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
