import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogView } from "@/components/CatalogView";

export const metadata: Metadata = { title: "Catalog · Fitting Room (prototype)" };

export default function CatalogPage() {
  return (
    <Suspense fallback={<p className="muted">Loading catalog…</p>}>
      <CatalogView />
    </Suspense>
  );
}
