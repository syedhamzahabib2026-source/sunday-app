import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import ClientProviders from "@/components/ClientProviders";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Sunday", template: "%s — Sunday" },
  description: "AI-powered weekly life scheduler. Build your week around your real life.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="antialiased bg-white text-zinc-900 min-h-screen">
        <ClientProviders>
          <Nav />
          <main>{children}</main>
        </ClientProviders>
      </body>
    </html>
  );
}
