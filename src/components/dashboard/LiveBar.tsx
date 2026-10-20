"use client";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PROJECT_NAME } from "@/lib/project-brand";
import { useAppModel } from "./DemoAppProvider";

/**
 * The persistent mode line in live mode, the counterpart of the demo bar: the app is reading real services, it cannot act,
 * and where to end the session. Rendered only for the live provider.
 */
export function LiveBar() {
  const { model, actions } = useAppModel();
  if (model.mode !== "live") return null;
  return (
    <div className="livebar" role="region" aria-label="Application mode">
      <Chip tone="neutral" material="outline">LIVE · READ-ONLY</Chip>
      <p>
        <b>Live services, read-only.</b>{" "}
        <span>This app reads public chain data and your research history. There is no {PROJECT_NAME} account here, swaps are off and nothing is signed.</span>
      </p>
      <Button variant="ghost" size="small" onClick={actions.logout}>
        Sign out
      </Button>
    </div>
  );
}
