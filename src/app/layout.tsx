import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { FeedbackProvider } from "@/components/ui";
import { AppTopBar } from "@/components/AppTopBar";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "SCORMcraft",
  description: "AI-assisted SCORM course authoring and export",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The theme script adds a class to <html> before hydration.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <FeedbackProvider>
          <AppTopBar />
          {children}
        </FeedbackProvider>
      </body>
    </html>
  );
}
