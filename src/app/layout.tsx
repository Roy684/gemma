import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "EchoJSON — On-Device WebGPU Audio Inference",
  description:
    "A premium on-device WebGPU-accelerated JSON entity extraction from live audio using Transformers.js v3 and Google's Gemma 4 E2B model.",
  keywords: [
    "WebGPU",
    "Transformers.js",
    "Gemma 4",
    "Audio Inference",
    "Web Audio API",
    "Local LLM",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full dark ${outfit.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="h-full bg-dark-950 text-slate-100 flex flex-col font-sans overflow-x-hidden selection:bg-brand-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
