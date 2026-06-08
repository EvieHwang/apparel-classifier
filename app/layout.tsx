import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apparel Classifier — live demo",
  description:
    "Corrupts real apparel records, recovers the articleType with an LLM, and reports accuracy against ground truth.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
