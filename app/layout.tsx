import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Torrey Tools — Client Portal",
  description:
    "HR client portal for Torrey Tools consulting: people, PTO, documents, onboarding, and reviews.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
