import type { Metadata } from "next";
import {
  Anton,
  Barlow,
  Barlow_Semi_Condensed,
  Zilla_Slab,
} from "next/font/google";
import "./globals.css";
import "@youversion/platform-react-ui/styles.css";
import Providers from "./providers";

// Non-variable Google fonts require explicit weights (Next 16). Each exposes a
// CSS variable consumed by globals.css / component inline styles.
const anton = Anton({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-anton",
});

const barlow = Barlow({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-barlow",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-barlow-semi",
});

const zillaSlab = Zilla_Slab({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zilla",
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
      className={`${anton.variable} ${barlow.variable} ${barlowSemiCondensed.variable} ${zillaSlab.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers appKey={appKey!}>{children}</Providers>
      </body>
    </html>
  );
}
