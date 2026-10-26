import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks } from "@/components/NavLinks";
import { ProfileProvider } from "@/components/ProfileProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitting Room (prototype)",
  description: "Prototype virtual fitting room: build an avatar, try fictional demo garments, and compare sizes.",
};

export const viewport: Viewport = {
  themeColor: "#050608",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="prototype-banner" role="note">
          <strong>Prototype</strong> · Demo garments are fictional · Previews are static and are not validated fit predictions
        </div>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Fitting Room
          </Link>
          <NavLinks />
        </header>
        <ProfileProvider>
          <main id="main">{children}</main>
        </ProfileProvider>
        <footer className="site-footer">
          Your measurements stay in this browser (local storage) and are never sent to a server. Delete them anytime from{" "}
          <Link href="/avatar">My avatar</Link>.
        </footer>
      </body>
    </html>
  );
}
