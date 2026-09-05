import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '魂斗罗 · 铁血突击',
  icons: { icon: '/favicon.svg' },
  description: '一枪，一跃，重返战场。原创像素画面的魂斗罗风格三关网页游戏。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
