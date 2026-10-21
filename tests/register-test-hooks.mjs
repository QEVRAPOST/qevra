import Module, { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./server-only-loader.mjs", import.meta.url);

// tsx compiles some test imports to CommonJS require(), which bypasses ESM resolve hooks.
const originalResolveFilename = Module._resolveFilename;
const testShimPath = fileURLToPath(new URL("./server-only-test-shim.cjs", import.meta.url));
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "server-only") return testShimPath;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
