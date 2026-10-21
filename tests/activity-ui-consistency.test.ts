import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const activitySource = readFileSync("src/components/dashboard/ActivityView.tsx", "utf8");

test("Activity history pagination and retry use the shared Aperture button", () => {
  assert.match(activitySource, /import \{ Button \} from "@\/components\/ui\/Button"/);
  assert.match(activitySource, /<Button variant="ghost" size="small" disabled=\{researchAccess\.isLoadingMore\}[^>]*>[\s\S]*?Load more/);
  assert.match(activitySource, /<Button variant="ghost" size="small" disabled=\{sec\.isRefreshing\}[^>]*>[\s\S]*?Retry run history/);
  assert.doesNotMatch(activitySource, /<button[^>]*className="btn"/);
});
