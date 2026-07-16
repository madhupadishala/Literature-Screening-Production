import "./globals.css";
import type { Metadata } from "next";
import SessionTimeoutGuard from "@/components/SessionTimeoutGuard";

export const metadata: Metadata = {
  title: "ClinixAI Literature Intelligence",
  description: "ClinixAI Enterprise Literature Screening Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Global Session Manager */}
        <SessionTimeoutGuard />

        {/* Application */}
        {children}
      </body>
    </html>
  );
}