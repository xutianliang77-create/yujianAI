import type { AgentArtifactVerificationV1 } from "@yujian/platform-contracts";
import type { AgentArtifactVerificationInput } from "./controller.js";

export interface ArtifactVerifierCredentialLease {
  authorization: string;
  expiresAt: string;
  release?: () => void | Promise<void>;
}

export interface ArtifactVerifierCredentialProvider {
  resolve(input: { tenantId: string; projectId: string }): Promise<ArtifactVerifierCredentialLease>;
}

export interface HttpsAgentArtifactVerifierOptions {
  endpoint: string;
  verifierId: string;
  credentialProvider: ArtifactVerifierCredentialProvider;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function endpoint(value: string): string {
  const parsed = new URL(value);
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new TypeError("artifact verifier endpoint must use HTTPS outside loopback");
  if (parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") throw new TypeError("artifact verifier endpoint is invalid");
  return parsed.toString();
}

function safeAuthorization(value: string): string {
  if (value.length < 16 || value.length > 8_192 || /[\r\n\u0000]/u.test(value)) throw new TypeError("artifact verifier credential is invalid");
  return value;
}

function sha(value: unknown): value is string { return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value); }

function parseReceipt(value: unknown, input: AgentArtifactVerificationInput, verifierId: string): AgentArtifactVerificationV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("artifact verifier response is invalid");
  const data = value as Record<string, unknown>;
  if (data.verified !== true || data.verifierId !== verifierId || data.image !== input.image || data.digest !== input.digest || data.signatureRef !== input.signatureRef || data.sbomUri !== input.sbomUri) {
    throw new Error("artifact verifier did not bind the exact artifact");
  }
  if (!sha(data.policyDigest) || !sha(data.receiptDigest) || typeof data.verifiedAt !== "string" || !Number.isFinite(Date.parse(data.verifiedAt))) {
    throw new Error("artifact verifier receipt is invalid");
  }
  return { verifierId, policyDigest: data.policyDigest, receiptDigest: data.receiptDigest, verifiedAt: data.verifiedAt };
}

/** HTTPS verifier boundary for OCI digest, signature policy and SBOM attestation. */
export class HttpsAgentArtifactVerifier {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpsAgentArtifactVerifierOptions) {
    this.endpoint = endpoint(options.endpoint);
    if (options.verifierId.length === 0 || options.verifierId.length > 128 || /[\u0000-\u001f\u007f]/u.test(options.verifierId)) throw new TypeError("artifact verifier id is invalid");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 60_000) throw new RangeError("artifact verifier timeout is invalid");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  verify = async (input: AgentArtifactVerificationInput): Promise<AgentArtifactVerificationV1> => {
    const credential = await this.options.credentialProvider.resolve({ tenantId: input.tenantId, projectId: input.projectId });
    if (!Number.isFinite(Date.parse(credential.expiresAt)) || Date.parse(credential.expiresAt) <= Date.now()) throw new Error("artifact verifier credential expired");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("artifact-verifier-timeout"), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { accept: "application/json", authorization: safeAuthorization(credential.authorization), "content-type": "application/json" },
        body: JSON.stringify({ contractVersion: "yujian.agent-artifact-verification.v1", ...input, exactImageRef: `${input.image}@${input.digest}` }),
      });
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > 32_768) throw new Error("artifact verifier response is too large");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 32_768) throw new Error("artifact verifier response is too large");
      if (!response.ok) throw new Error("artifact verifier rejected the artifact");
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("artifact verifier response is invalid"); }
      return parseReceipt(parsed, input, this.options.verifierId);
    } finally {
      clearTimeout(timer);
      try { await credential.release?.(); } catch { /* Cleanup cannot make an accepted verification invalid. */ }
    }
  };
}
