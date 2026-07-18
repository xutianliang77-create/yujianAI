import type { OwnerId, OwnerSignature } from "./types.js";

export interface OwnerSignerInput {
  owner: OwnerId;
  artifact: Buffer;
  wrappedToken: string;
}

export interface OwnerSigner {
  sign(input: OwnerSignerInput): Promise<OwnerSignature>;
}

export class OwnerSignerError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 403 | 502,
  ) {
    super(message);
    this.name = "OwnerSignerError";
  }
}

interface OpenBaoAuth {
  client_token?: unknown;
  policies?: unknown;
  token_policies?: unknown;
  metadata?: unknown;
  lease_duration?: unknown;
  renewable?: unknown;
}

interface OpenBaoResponse {
  auth?: OpenBaoAuth;
  data?: Record<string, unknown>;
}

function responseRecord(value: unknown): OpenBaoResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as OpenBaoResponse
    : {};
}

export class OpenBaoOwnerSigner implements OwnerSigner {
  private readonly addresses: readonly string[];

  constructor(addresses: readonly string[], private readonly timeoutMs = 5_000) {
    this.addresses = addresses.map((address) => address.replace(/\/$/u, ""));
    if (this.addresses.length === 0 || this.addresses.some((address) => !/^https?:\/\//u.test(address))) {
      throw new Error("OpenBao addresses are invalid");
    }
  }

  async sign(input: OwnerSignerInput): Promise<OwnerSignature> {
    const unwrapped = await this.request("/v1/sys/wrapping/unwrap", input.wrappedToken, {});
    const token = await this.personalToken(unwrapped, input.owner);
    let signature: string | undefined;
    let failure: unknown;
    try {
      const keyName = `yujian-owner-${input.owner}`;
      const payload = { input: input.artifact.toString("base64") };
      const signed = await this.request(`/v1/transit/sign/${keyName}/sha2-256`, token, payload);
      signature = typeof signed.data?.signature === "string" ? signed.data.signature : undefined;
      if (signature === undefined || !/^vault:v[1-9][0-9]*:[A-Za-z0-9+/=]+$/u.test(signature)) {
        throw new OwnerSignerError("OpenBao 未返回有效签名", 502);
      }
      const verified = await this.request(`/v1/transit/verify/${keyName}/sha2-256`, token, { ...payload, signature });
      if (verified.data?.valid !== true) throw new OwnerSignerError("OpenBao 签名验签失败", 502);
    } catch (error) {
      failure = error;
    }
    try {
      await this.request("/v1/auth/token/revoke-self", token, {});
    } catch {
      throw new OwnerSignerError("个人签名 token 撤销失败，决定未归档", 502);
    }
    if (failure !== undefined) throw failure;
    const version = Number(signature?.match(/^vault:v([1-9][0-9]*):/u)?.[1]);
    if (!Number.isSafeInteger(version) || version < 1 || signature === undefined) {
      throw new OwnerSignerError("OpenBao 签名版本无效", 502);
    }
    return {
      keyUri: `openbao://yujian-owner-${input.owner}`,
      keyVersion: version,
      signature,
      verified: true,
      credentialRevoked: true,
    };
  }

  private async personalToken(response: OpenBaoResponse, owner: OwnerId): Promise<string> {
    const auth = response.auth;
    if (auth === undefined || typeof auth.client_token !== "string" || auth.client_token.length < 20) {
      throw new OwnerSignerError("一次性签名凭据无效或已经使用", 401);
    }
    const policies = Array.isArray(auth.token_policies)
      ? auth.token_policies
      : Array.isArray(auth.policies) ? auth.policies : [];
    const metadata = typeof auth.metadata === "object" && auth.metadata !== null && !Array.isArray(auth.metadata)
      ? auth.metadata as Record<string, unknown>
      : {};
    const expectedPolicy = `yujian-owner-${owner}-signer`;
    const validLease = Number.isSafeInteger(auth.lease_duration)
      && Number(auth.lease_duration) > 0
      && Number(auth.lease_duration) <= 900;
    if (policies.length !== 1 || policies[0] !== expectedPolicy
      || metadata.personal_owner !== owner || auth.renewable !== false || !validLease) {
      try {
        await this.request("/v1/auth/token/revoke-self", auth.client_token, {});
      } catch {
        throw new OwnerSignerError("越权签名凭据撤销失败", 502);
      }
      throw new OwnerSignerError("签名凭据不属于当前 Owner 或权限超出范围", 403);
    }
    return auth.client_token;
  }

  private async request(path: string, token: string, body: Record<string, unknown>): Promise<OpenBaoResponse> {
    let lastFailure: unknown;
    for (const address of this.addresses) {
      try {
        const response = await fetch(`${address}${path}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-vault-token": token,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          if (response.status < 500) {
            throw new OwnerSignerError(
              path === "/v1/sys/wrapping/unwrap" ? "一次性签名凭据无效或已经使用" : "OpenBao 拒绝签名请求",
              path === "/v1/sys/wrapping/unwrap" ? 401 : 403,
            );
          }
          lastFailure = new Error(`OpenBao HTTP ${response.status}`);
          continue;
        }
        const text = await response.text();
        if (text.length === 0) return {};
        try {
          return responseRecord(JSON.parse(text) as unknown);
        } catch {
          throw new OwnerSignerError("OpenBao 返回了无效响应", 502);
        }
      } catch (error) {
        if (error instanceof OwnerSignerError) throw error;
        lastFailure = error;
      }
    }
    throw new OwnerSignerError("OpenBao 当前不可用", 502);
  }
}
