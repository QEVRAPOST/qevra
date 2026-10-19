"use client";

import { createContext, useContext } from "react";
import type { AppModelValue, PreviewControls } from "@/types";

export const ModelContext = createContext<AppModelValue | null>(null);
export const PreviewContext = createContext<PreviewControls | null>(null);

export function useAppModel(): AppModelValue {
  const value = useContext(ModelContext);
  if (!value) throw new Error("useAppModel must be used inside an app model provider");
  return value;
}

/** Preview controls exist only in demo mode. Live mode returns null. */
export function usePreviewControls(): PreviewControls | null {
  return useContext(PreviewContext);
}
