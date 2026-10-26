/**
 * Generates the fictional demo garment GLBs in public/demo-assets/ from the
 * size tables in src/adapters/retailers/demoCatalog.ts.
 *
 *   npm run assets:demo
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEMO_PRODUCT_SPECS, demoAssetId, demoAssetUrl } from "../src/adapters/retailers/demoCatalog";
import { buildDemoGarment } from "../src/lib/demoGarments";
import { geometryToGlb } from "../src/lib/glb";

const outDir = path.resolve(__dirname, "../public/demo-assets");
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".glb")) rmSync(path.join(outDir, f));

let count = 0;
for (const spec of DEMO_PRODUCT_SPECS) {
  for (const variant of spec.variants) {
    for (const size of spec.sizes) {
      if (size.asset === "none" || size.asset === "approved-missing-file") continue;
      const assetId = demoAssetId(spec.productId, variant.variantId, size.label);
      const geometry = buildDemoGarment(spec.kind, size.measurements);
      const glb = geometryToGlb(geometry, {
        name: assetId,
        colorHex: variant.colorHex,
        extras: {
          assetId,
          demo: true,
          notice: "Fictional demo garment. Not a real retail product. Not a fit prediction.",
          anchor: spec.anchor,
          units: "m",
        },
      });
      const file = path.join(outDir, path.basename(demoAssetUrl(assetId)));
      writeFileSync(file, glb);
      count++;
      console.log(`wrote ${path.relative(process.cwd(), file)} (${glb.byteLength} bytes)`);
    }
  }
}
console.log(`Generated ${count} demo garment assets.`);
