/**
 * Analytics boundary (PRD §12). Events are typed so dashboards stay stable.
 * The MVP sink only logs in development; no data leaves the browser.
 * Never include body measurements in event payloads.
 */
export type AnalyticsEvent =
  | { name: "avatar_saved"; props: { isNew: boolean } }
  | { name: "avatar_deleted"; props: Record<string, never> }
  | { name: "tryon_started"; props: { productId: string; variantId: string; size: string; hasSavedAvatar: boolean } }
  | { name: "tryon_rendered"; props: { productId: string; variantId: string; size: string } }
  | { name: "tryon_asset_failed"; props: { productId: string; variantId: string; size: string } }
  | { name: "size_switched"; props: { productId: string; from: string; to: string } }
  | { name: "return_to_product"; props: { productId: string; variantId: string; size: string } }
  | { name: "size_compare_started"; props: { productId: string; sizes: [string, string] } }
  | { name: "look_saved"; props: { productId: string; variantId: string; size: string; compareSize: string | null } }
  | { name: "look_removed"; props: Record<string, never> }
  | { name: "data_exported"; props: Record<string, never> }
  | { name: "all_data_deleted"; props: Record<string, never> };

export interface AnalyticsSink {
  track(event: AnalyticsEvent): void;
}

class DevConsoleSink implements AnalyticsSink {
  track(event: AnalyticsEvent) {
    if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event.name, event.props);
  }
}

let sink: AnalyticsSink = new DevConsoleSink();

export function setAnalyticsSink(next: AnalyticsSink) {
  sink = next;
}

export function track(event: AnalyticsEvent) {
  try {
    sink.track(event);
  } catch {
    // Analytics must never break the shopping flow.
  }
}
