// Guards against deployment-only failures: the Vercel function runtime does not allow
// require() of ES modules. firebase-admin/auth (→ jwks-rsa → jose) must still load there.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const run = (code: string) =>
  execFileSync(process.execPath, ["--no-experimental-require-module", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 60000 });

describe("server SDKs load without require(esm), as on Vercel", () => {
  it("firebase-admin app, auth and firestore load", () => {
    expect(run(`require("firebase-admin/app"); require("firebase-admin/auth"); require("firebase-admin/firestore"); console.log("ok")`).trim()).toBe("ok");
  });
  it("jwks-rsa can import a JWK and export SPKI (used to verify Firebase tokens)", () => {
    const out = run(`
      const { retrieveSigningKeys } = require("jwks-rsa/src/utils");
      const { generateKeyPairSync } = require("node:crypto");
      const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      retrieveSigningKeys([{ ...publicKey.export({ format: "jwk" }), kid: "k1", use: "sig", alg: "RS256" }])
        .then((k) => console.log(k[0].getPublicKey().includes("BEGIN PUBLIC KEY") ? "ok" : "bad"));`);
    expect(out.trim()).toBe("ok");
  });
  it("google-auth-library (Sheets sync) loads", () => {
    expect(run(`require("google-auth-library"); console.log("ok")`).trim()).toBe("ok");
  });
});
