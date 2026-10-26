import type { Metadata } from "next";
import { AvatarEditor } from "@/components/AvatarEditor";

export const metadata: Metadata = { title: "My avatar · Fitting Room (prototype)" };

export default function AvatarPage() {
  return <AvatarEditor />;
}
