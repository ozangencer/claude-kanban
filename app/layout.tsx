import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BackupScheduler } from "@/components/backup-scheduler";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Kanban",
  description: "Development workflow management for solo founders",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={100} skipDelayDuration={0}>
            <BackupScheduler />
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
