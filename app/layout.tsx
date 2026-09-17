import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'LegalLens — GenAI Legal Document Assistant',
  description:
    'Understand, navigate, and compare legal documents in plain English with clause attention flags, document-scoped Q&A, and lawyer checklists.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
