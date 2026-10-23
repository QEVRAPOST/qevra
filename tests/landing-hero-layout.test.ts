import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import postcss from "postcss";

const stylesheet = postcss.parse(
  readFileSync(fileURLToPath(new URL("../src/styles/landing.css", import.meta.url)), "utf8"),
);

function mediaMatches(params: string, width: number, height: number) {
  const minWidth = params.match(/\(min-width:\s*(\d+)px\)/)?.[1];
  const maxWidth = params.match(/\(max-width:\s*(\d+)px\)/)?.[1];
  const minHeight = params.match(/\(min-height:\s*(\d+)px\)/)?.[1];
  const maxHeight = params.match(/\(max-height:\s*(\d+)px\)/)?.[1];

  return (!minWidth || width >= Number(minWidth))
    && (!maxWidth || width <= Number(maxWidth))
    && (!minHeight || height >= Number(minHeight))
    && (!maxHeight || height <= Number(maxHeight));
}

function hasMediaDeclaration(selector: string, property: string, value: string, width: number, height: number) {
  let found = false;

  stylesheet.walkAtRules("media", (media) => {
    if (!mediaMatches(media.params, width, height)) return;
    media.walkRules(selector, (rule) => {
      rule.walkDecls(property, (declaration) => {
        if (declaration.value === value) found = true;
      });
    });
  });

  return found;
}

test("short laptop hero keeps copy in page flow while its scene remains scroll-pinned", () => {
  for (const width of [1025, 1280, 1366]) {
    assert.equal(hasMediaDeclaration(".hs-pin", "position", "sticky", width, 768), false);
    assert.equal(hasMediaDeclaration(".hgrid", "min-height", "calc(var(--hs-avail) * 2.2)", width, 768), true);
  }

  assert.equal(hasMediaDeclaration(".hs-pin", "position", "sticky", 1440, 900), true);
  assert.equal(hasMediaDeclaration(".hgrid", "min-height", "calc(var(--hs-avail) * 2.2)", 1440, 900), false);
});
