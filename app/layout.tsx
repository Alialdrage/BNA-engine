import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BNA Engine V3',
  description: 'محرك تحليل نصوص عربي مع دعم اللهجة العراقية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="text-white antialiased">{children}</body>
    </html>
  );
}
