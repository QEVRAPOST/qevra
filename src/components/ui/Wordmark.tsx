import Image from "next/image";

/** Shared brand symbol used in landing and application navigation. */
export function WordmarkMark() {
  return <Image className="wordmark-mark" src="/logo.png" width={36} height={36} alt="" aria-hidden="true" unoptimized />;
}
