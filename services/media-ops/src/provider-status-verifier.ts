import type { MediaProviderStatusUpdateV1 } from "@yujian/platform-contracts";

export interface MediaProviderStatusVerification {
  attestationDigest: string;
  providerSequence: number;
  occurredAt: string;
  providerName: string;
}

export interface MediaProviderStatusVerifier {
  verify(input: {
    environmentId: string;
    resourceKind: "call" | "ingress" | "egress";
    resourceId: string;
    update: MediaProviderStatusUpdateV1;
    edgeAttestation: string | undefined;
  }): Promise<MediaProviderStatusVerification>;
}

export interface HttpsMediaProviderStatusVerifierOptions {
  endpoint: string;
  authorization: () => string | Promise<string>;
  timeoutMs?: number;
}

function endpoint(value: string): URL {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if ((!loopback && url.protocol !== "https:") || (loopback && url.protocol !== "https:" && url.protocol !== "http:")) throw new TypeError("media status verifier must use HTTPS outside loopback");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new TypeError("media status verifier endpoint cannot contain credentials, query or fragment");
  return url;
}

/** Exchanges an opaque edge attestation for a bounded, non-secret verification receipt. */
export class HttpsMediaProviderStatusVerifier implements MediaProviderStatusVerifier {
  private readonly url: URL;
  private readonly timeoutMs: number;
  constructor(private readonly options: HttpsMediaProviderStatusVerifierOptions) {
    this.url = endpoint(options.endpoint);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 30_000) throw new RangeError("media status verifier timeout is invalid");
  }

  async verify(input: Parameters<MediaProviderStatusVerifier["verify"]>[0]): Promise<MediaProviderStatusVerification> {
    if (input.edgeAttestation === undefined || input.edgeAttestation.length < 32 || input.edgeAttestation.length > 8_192 || /[\u0000-\u001f\u007f]/u.test(input.edgeAttestation)) throw new Error("media edge attestation is missing or invalid");
    const authorization = await this.options.authorization();
    if (authorization.length < 16 || authorization.length > 4_096 || /[\r\n]/u.test(authorization)) throw new Error("media status verifier authorization is invalid");
    const response = await fetch(this.url, {
      method: "POST",
      headers: { accept: "application/json", authorization, "content-type": "application/json" },
      body: JSON.stringify({ ...input, edgeAttestation: input.edgeAttestation }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error("media status verifier rejected the callback");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 16_384) throw new Error("media status verifier response is too large");
    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > 16_384) throw new Error("media status verifier response is too large");
    let value: Partial<MediaProviderStatusVerification> & { approved?: boolean };
    try { value = JSON.parse(responseText) as typeof value; } catch { throw new Error("media status verifier returned invalid JSON"); }
    if (value.approved !== true || typeof value.attestationDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value.attestationDigest)) throw new Error("media status verifier returned an invalid digest");
    if (!Number.isSafeInteger(value.providerSequence) || (value.providerSequence ?? -1) < 0) throw new Error("media status verifier returned an invalid sequence");
    if (typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt))) throw new Error("media status verifier returned an invalid event time");
    if (typeof value.providerName !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/u.test(value.providerName)) throw new Error("media status verifier returned an invalid provider name");
    return { attestationDigest: value.attestationDigest, providerSequence: value.providerSequence, occurredAt: value.occurredAt, providerName: value.providerName } as MediaProviderStatusVerification;
  }
}
