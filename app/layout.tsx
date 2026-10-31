import type { Metadata, Viewport } from "next";
// Fonts are bundled from npm (Fontsource), so pages never depend on reaching Google Fonts.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThinkAloud: build it yourself, explain it out loud",
  description:
    "Learn the part AI can't fake for you. Build a Coding Challenges project in your own editor and language, learn the concepts underneath, and explain them in your own words.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDEFF1" },
    { media: "(prefers-color-scheme: dark)", color: "#14171B" },
  ],
};

// Applies the saved theme before the first paint, so a dark choice never flashes light.
const THEME_SCRIPT = `try{var t=localStorage.getItem('ta-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
