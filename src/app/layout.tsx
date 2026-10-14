import type { Metadata } from "next";
import { poppins } from "@/app/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Getmeds Files", template: "%s · Getmeds Files" },
  description: "Company files from Zoho WorkDrive",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} font-sans h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
