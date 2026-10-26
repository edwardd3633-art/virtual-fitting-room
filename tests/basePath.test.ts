import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("withBasePath", () => {
  it("is a no-op without a base path (local dev)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    const { withBasePath } = await import("@/lib/basePath");
    expect(withBasePath("/demo-assets/x.glb")).toBe("/demo-assets/x.glb");
  });

  it("prefixes site-relative URLs for a GitHub Pages sub-path", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/virtual-fitting-room");
    const { withBasePath } = await import("@/lib/basePath");
    expect(withBasePath("/demo-assets/x.glb")).toBe("/virtual-fitting-room/demo-assets/x.glb");
    expect(withBasePath("https://cdn.example/x.glb")).toBe("https://cdn.example/x.glb");
  });
});
