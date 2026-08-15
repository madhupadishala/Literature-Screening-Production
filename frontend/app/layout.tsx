import "./globals.css";
import type { Metadata } from "next";
import SessionTimeoutGuard from "@/components/SessionTimeoutGuard";
import AuthGate from "@/components/AuthGate";
import ValidationDemoBanner from "@/components/ValidationDemoBanner";

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
        <ValidationDemoBanner />
        {/* Global Session Manager */}
        <SessionTimeoutGuard />

        {/* Redirects to /login when there is no valid, non-expired session */}
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
