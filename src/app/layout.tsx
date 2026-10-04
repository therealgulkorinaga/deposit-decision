import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Depositcheck — Your rental deposit",
  description:
    "Review your rental deposit deduction, organise evidence and prepare your next step. An Irish rental-deposit UI prototype.",
};
export const viewport: Viewport = { themeColor: "#246955" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IE">
      <body>{children}</body>
    </html>
  );
}
