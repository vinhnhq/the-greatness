import { describe, expect, it } from "vitest";

import { credentialsMatch, makeToken, verifyToken } from "@/lib/showcase-token";

const expected = { user: "admin", password: "correct horse" };

describe("credentialsMatch", () => {
  it("accepts the exact pair", () => {
    expect(
      credentialsMatch({ user: "admin", password: "correct horse" }, expected),
    ).toBe(true);
  });
  it("rejects a wrong password, a wrong user, and a different length", () => {
    expect(
      credentialsMatch({ user: "admin", password: "wrong" }, expected),
    ).toBe(false);
    expect(
      credentialsMatch({ user: "root", password: "correct horse" }, expected),
    ).toBe(false);
    expect(
      credentialsMatch({ user: "admin", password: "correct horse!" }, expected),
    ).toBe(false);
  });
  it("rejects everything when nothing is configured", () => {
    expect(
      credentialsMatch({ user: "admin", password: "correct horse" }, null),
    ).toBe(false);
  });
});

describe("verifyToken", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  it("round-trips a token it made", () => {
    expect(verifyToken(secret, makeToken(secret, "admin"), "admin")).toBe(
      "admin",
    );
  });
  it("rejects a token signed with another secret", () => {
    expect(
      verifyToken(secret, makeToken("other-secret-0123456", "admin"), "admin"),
    ).toBeNull();
  });
  it("rejects a token for a user who is not the configured one", () => {
    expect(verifyToken(secret, makeToken(secret, "root"), "admin")).toBeNull();
  });
  it("rejects a tampered username with the old mac", () => {
    const [, mac] = makeToken(secret, "admin").split(".");
    expect(verifyToken(secret, `root.${mac}`, "root")).toBeNull();
  });
  it("rejects a missing, empty or shapeless token, and no configured user", () => {
    expect(verifyToken(secret, undefined, "admin")).toBeNull();
    expect(verifyToken(secret, "", "admin")).toBeNull();
    expect(verifyToken(secret, "no-dot", "admin")).toBeNull();
    expect(verifyToken(secret, ".onlymac", "admin")).toBeNull();
    expect(
      verifyToken(secret, makeToken(secret, "admin"), undefined),
    ).toBeNull();
  });
});
