import type { Metadata } from "next";
import { Suspense } from "react";
import { TryOn } from "@/components/TryOn";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";

export const metadata: Metadata = { title: "Try on · Fitting Room (prototype)" };

/** Pre-render one page per catalog product so the site can be hosted as static files. */
export function generateStaticParams() {
  return DEMO_CATALOG.products.map((p) => ({ productId: p.productId }));
}
export const dynamicParams = false;

export default async function TryOnPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return (
    <Suspense fallback={<p className="panel">Loading…</p>}>
      <TryOn productId={productId} />
    </Suspense>
  );
}
