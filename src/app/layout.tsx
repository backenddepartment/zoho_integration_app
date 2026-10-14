import type { Metadata } from "next";
import { Suspense } from "react";
import { poppins } from "@/app/fonts";
import { TopProgress } from "@/components/top-progress";
import { Loading } from "@/components/ui";
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
      <body className="min-h-full flex flex-col font-sans">
        {/* It reads the URL, which isn't known while prerendering. */}
        <Suspense fallback={null}>
          <TopProgress />
        </Suspense>
        {/* One boundary for every page, above them all: when moving between pages it is already
            showing, so React keeps the current page on screen (with the loading line running)
            until the next one is ready, instead of flashing a "Loading…" placeholder. */}
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </body>
    </html>
  );
}
