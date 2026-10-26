"use client";

import dynamic from "next/dynamic";

/** WebGL needs the browser, so the viewport never renders on the server; the page stays usable while it loads. */
export const LazyViewport = dynamic(() => import("./three/Viewport"), {
  ssr: false,
  loading: () => (
    <div className="viewport viewport-placeholder" aria-busy="true">
      <div style={{ display: "grid", justifyItems: "center" }}>
        <span className="spinner" aria-hidden="true" />
        Loading 3D viewer…
      </div>
    </div>
  ),
});
