import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { OfflineProvider } from "@/components/offline/offline-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { InAppBrowserBanner } from "@/components/in-app-browser-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBase =
  typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""))
      : undefined;

export const metadata: Metadata = {
  metadataBase: metadataBase ?? new URL("http://localhost:3000"),
  title: "EFCT | إدارة مراكز الصيانة ومحلات قطع غيار السيارات",
  description:
    "برنامج متكامل لإدارة مراكز خدمة السيارات ومحلات بيع قطع الغيار. المخزون، الفواتير، الورشة، الكاشير، العملاء، الموردين، التقارير.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* مانيفست صريح لأدوات مثل PWABuilder؛ anonymous يتوافق مع CORS Allow-Origin: * */}
        <link rel="manifest" href="/manifest.json" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('alameen-theme');var d=typeof window.matchMedia!=='undefined'&&window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.add(t||(d?'dark':'light')||'light');}catch(e){document.documentElement.classList.add('light');}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <ThemeProvider>
            <OfflineProvider>
              <PwaProvider>
                <InAppBrowserBanner />
                {children}
              </PwaProvider>
            </OfflineProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
