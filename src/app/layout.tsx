import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { RenderNudgeProvider } from "@/components/ui/render-nudge";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SalonFlow", template: "%s · SalonFlow" },
  description: "Fast sales entry, payment tracking and reports for beauty salons.",
  applicationName: "SalonFlow",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fbf8f4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <RenderNudgeProvider>
          <ToastProvider>{children}</ToastProvider>
        </RenderNudgeProvider>
      </body>
    </html>
  );
}
