import type { Metadata } from "next";
import { SavedLooks } from "@/components/SavedLooks";

export const metadata: Metadata = { title: "Saved looks · Fitting Room (prototype)" };

export default function SavedPage() {
  return <SavedLooks />;
}
