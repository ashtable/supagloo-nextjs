import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@youversion/platform-react-ui/styles.css";
import Providers from "./providers";
import AuthButton from "./auth-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Supagloo",
  description: "Tools for Creators, Built on Gloo AI & YouVersion Platform",
};

const appKey = process.env.YV_APP_KEY;
if (!appKey) throw new Error("YV_APP_KEY is not set");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers appKey={appKey!}>
          <header className="flex justify-end p-4">
            <AuthButton />
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
