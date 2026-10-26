import type { Metadata } from "next";
import { Suspense } from "react";
import { TryOn } from "@/components/TryOn";

export const metadata: Metadata = { title: "Try on · Fitting Room (prototype)" };

export default async function TryOnPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return (
    <Suspense fallback={<p className="panel">Loading…</p>}>
      <TryOn productId={productId} />
    </Suspense>
  );
}
