import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pongo's Arena",
  description: "The official watcher's arena for the Bornean canopy.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-black">{children}</body>
    </html>
  );
}
