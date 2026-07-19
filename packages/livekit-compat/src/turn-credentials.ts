import { createHmac } from "node:crypto";
import type { IssuedTurnCredentialV1, NormalizedTurnCredentialRequestV1 } from "@yujian/platform-contracts";

export class TurnCredentialIssuer {
  private readonly secret: Buffer;
  private readonly urls: readonly string[];

  constructor(secret: Uint8Array, urls: readonly string[], private readonly clock: () => number = Date.now) {
    this.secret = Buffer.from(secret);
    if (this.secret.length < 32) throw new TypeError("TURN shared secret must be at least 32 bytes");
    if (urls.length === 0 || urls.length > 16) throw new TypeError("TURN URL list must contain 1-16 entries");
    this.urls = urls.map((value) => {
      let parsed: URL;
      try { parsed = new URL(value); } catch { throw new TypeError("TURN URL is invalid"); }
      if (!["turn:", "turns:"].includes(parsed.protocol) || parsed.username !== "" || parsed.password !== "") throw new TypeError("TURN URL must use turn(s) without embedded credentials");
      return value;
    });
  }

  issue(request: NormalizedTurnCredentialRequestV1): IssuedTurnCredentialV1 {
    const expiresAtMs = this.clock() + request.ttlSeconds * 1_000;
    const username = `${Math.floor(expiresAtMs / 1_000)}:${request.participantIdentity}`;
    return {
      urls: this.urls,
      username,
      credential: createHmac("sha1", this.secret).update(username, "utf8").digest("base64"),
      credentialType: "password",
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }
}
