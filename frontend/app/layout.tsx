import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Canvas | The Arena",
  description: "High-stakes autonomous agent pixel battleground",
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
