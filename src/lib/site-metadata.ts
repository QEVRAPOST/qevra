import type { Metadata } from "next";

export const BRAND_LOGO_PATH = "/logo.png";
export const SOCIAL_PREVIEW_PATH = "/og-image.webp";

const DESCRIPTION = "EVM wallet reads, public Robinhood Chain evidence, and the VEYRA Research Engine's three-stage reports. Explore a service-dependent Mainnet 0x swap flow; post-quantum smart-account custody remains under security review.";

function getConfiguredMetadataBase(): URL | undefined {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!configuredOrigin) return undefined;
  try {
    const parsed = new URL(configuredOrigin);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function createSiteMetadata(projectName: string): Metadata {
  const metadataBase = getConfiguredMetadataBase();
  return {
    ...(metadataBase ? { metadataBase } : {}),
    title: { default: projectName, template: `%s · ${projectName}` },
    description: DESCRIPTION,
    icons: {
      icon: BRAND_LOGO_PATH,
      shortcut: BRAND_LOGO_PATH,
      apple: BRAND_LOGO_PATH,
    },
    openGraph: {
      title: projectName,
      description: DESCRIPTION,
      type: "website",
      images: [{
        url: SOCIAL_PREVIEW_PATH,
        width: 1731,
        height: 909,
        alt: `${projectName} read-only wallet access and Security Swarm research for Robinhood Chain`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: projectName,
      description: DESCRIPTION,
      images: [SOCIAL_PREVIEW_PATH],
    },
  };
}
