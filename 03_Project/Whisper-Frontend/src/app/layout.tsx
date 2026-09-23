import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Thai + Latin coverage - the previous Geist setup only loaded the "latin"
// subset, so every Thai string in dictionaries.ts was silently falling back
// to the browser's system font.
const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Whisper — AI Meeting Intelligence",
  description:
    "Whisper transcribes, diarizes, and summarizes Thai meetings, and turns them into action items automatically.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
