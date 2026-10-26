import type { GarmentCategory } from "@/domain/catalog";

/** Illustrative silhouette in the variant colour, lit like the 3D stage; demo products have no photography. */
export function ProductThumb({ category, color, id }: { category: GarmentCategory; color: string; id: string }) {
  const path =
    category === "bottoms"
      ? "M44 18 H76 L78 26 L96 104 H24 L42 26 Z"
      : "M46 14 L54 10 Q60 17 66 10 L74 14 L96 30 L88 44 L80 40 L80 106 H40 L40 40 L32 44 L24 30 Z";
  return (
    <svg viewBox="0 0 120 120" className="thumb" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id={`shade-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="110" rx="34" ry="3.5" fill="#000" opacity="0.6" />
      <path d={path} fill={color} strokeLinejoin="round" />
      <path d={path} fill={`url(#shade-${id})`} stroke="#ffffff22" strokeWidth="0.6" strokeLinejoin="round" />
    </svg>
  );
}
