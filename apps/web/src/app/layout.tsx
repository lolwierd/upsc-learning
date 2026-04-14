import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "UPSC MCQ Generator",
  description: "Generate and practice UPSC-style MCQ quizzes with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function isChunkError(e) {
                  return e && e.message && (e.message.includes('ChunkLoadError') || e.message.includes('Loading chunk'));
                }
                var KEY = '__chunk_reload';
                function reload() {
                  var path = window.location.pathname;
                  if (sessionStorage.getItem(KEY) !== path) {
                    sessionStorage.setItem(KEY, path);
                    window.location.reload();
                  }
                }
                window.addEventListener('error', function(e) {
                  if (isChunkError(e.error || e)) reload();
                });
                window.addEventListener('unhandledrejection', function(e) {
                  if (e.reason && isChunkError(e.reason)) reload();
                });
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <Header />
        <main className="min-h-[calc(100vh-65px)]">{children}</main>
      </body>
    </html>
  );
}
