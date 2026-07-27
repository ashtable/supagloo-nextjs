import type { Metadata } from "next";
import {
  Anton,
  Barlow,
  Barlow_Semi_Condensed,
  Zilla_Slab,
} from "next/font/google";
import "./globals.css";
import "@youversion/platform-react-ui/styles.css";
import { loadNextjsServerEnv } from "@/lib/config/env";
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

/**
 * Task 43 (D43.2) — a RE-READ of the already-validated config, not a second authored
 * env check. `instrumentation.ts` runs the same validator before the server can serve
 * anything, so by the time this module is evaluated at request time the environment has
 * already been proven good; this call is what turns `string | undefined` into `string`,
 * which is what retires the non-null assertion this line used to need.
 *
 * The module-scope THROW is kept on purpose: it is the observable behaviour
 * `tests/e2e/global-setup.ts:24-29` documents (a keyless server serves a 500 `/_error`
 * overlay, which `serverIsUp()` must not mistake for a healthy server), and it is the only
 * guard that still fires during `next build`, which Next excludes from instrumentation.
 */
const { YV_APP_KEY: appKey } = loadNextjsServerEnv();

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
        <Providers appKey={appKey}>{children}</Providers>
      </body>
    </html>
  );
}
