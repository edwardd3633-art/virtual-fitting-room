"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/avatar", label: "My avatar" },
  { href: "/catalog", label: "Catalog" },
  { href: "/saved", label: "Saved" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
