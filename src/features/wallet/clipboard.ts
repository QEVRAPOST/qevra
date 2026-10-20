export interface ClipboardWriter {
  writeText(value: string): Promise<void>;
}

/** Copy a public address when the browser grants clipboard access; report failure without throwing into the UI. */
export async function copyTextToClipboard(value: string, clipboard?: ClipboardWriter): Promise<boolean> {
  const target = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!target) return false;
  try {
    await target.writeText(value);
    return true;
  } catch {
    return false;
  }
}
