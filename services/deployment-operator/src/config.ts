export interface OperatorConfig {
  namespace: string;
  apiServer: string;
  tokenFile: string;
  intervalMs: number;
}

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`operator interval must be ${minimum}-${maximum}ms`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OperatorConfig {
  const namespace = env.YUJIAN_OPERATOR_NAMESPACE ?? env.POD_NAMESPACE;
  if (namespace === undefined || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u.test(namespace)) throw new Error("operator namespace is invalid");
  const apiServer = env.KUBERNETES_API_SERVER ?? "https://kubernetes.default.svc";
  const url = new URL(apiServer);
  if (url.protocol !== "https:") throw new Error("Kubernetes API server must use HTTPS");
  return {
    namespace,
    apiServer: url.toString().replace(/\/$/u, ""),
    tokenFile: env.KUBERNETES_TOKEN_FILE ?? "/var/run/secrets/kubernetes.io/serviceaccount/token",
    intervalMs: integer(env.YUJIAN_OPERATOR_INTERVAL_MS, 5_000, 1_000, 60_000),
  };
}
