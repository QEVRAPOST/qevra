import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { createSiteMetadata } from "@/lib/site-metadata";

test("landing and app wordmarks use the supplied logo asset", () => {
  const markup = renderToStaticMarkup(createElement(WordmarkMark));
  assert.match(markup, /src="\/logo\.png"/);
});

test("site metadata uses the supplied logo favicon and social preview image", () => {
  const metadata = createSiteMetadata("VEYRA");
  assert.deepEqual(metadata.icons, {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  });
  assert.deepEqual(metadata.openGraph?.images, [{
    url: "/og-image.webp",
    width: 1731,
    height: 909,
    alt: "VEYRA read-only wallet access and Security Swarm research for Robinhood Chain",
  }]);
  assert.deepEqual(metadata.twitter?.images, ["/og-image.webp"]);
  assert.equal((metadata.twitter as { card?: string } | undefined)?.card, "summary_large_image");
});
