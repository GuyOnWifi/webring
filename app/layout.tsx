import type { Metadata } from "next";
import "./globals.css";
import { getIndex } from "./data";

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
      <body className="mx-auto max-w-3xl px-4 pb-16 pt-10">{children}</body>
    </html>
  );
}
