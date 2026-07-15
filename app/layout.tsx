import type { Metadata } from "next";
import "./globals.css";
import { getIndex } from "./data";
import AsciiBackground from "./AsciiBackground";

export async function generateMetadata(): Promise<Metadata> {
  const { ring } = await getIndex();
  return {
    title: ring.name,
    description: ring.description,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8">
        {/* Google Sans (React 19 hoists these <link>s into <head>). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=Libre+Baskerville:ital,wght@0,400..700;1,400..700&family=Momo+Trust+Sans:wght@200..800&display=swap"
          rel="stylesheet"
        />
        <AsciiBackground />
        {children}
      </body>
    </html>
  );
}
