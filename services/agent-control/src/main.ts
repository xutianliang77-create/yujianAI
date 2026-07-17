import { readFileSync } from "node:fs";
import { createAgentControlHttpsServer, createAgentControlServer } from "./server.js";
import type { AgentControlServerOptions } from "./server.js";
import { loadAgentArtifactVerifier, loadAgentControlPersistence } from "./runtime.js";

const credential = process.env.YUJIAN_AGENT_INTERNAL_CREDENTIAL;
if (credential === undefined || credential.length < 32) throw new Error("YUJIAN_AGENT_INTERNAL_CREDENTIAL must be at least 32 characters");
const adminCredential = process.env.YUJIAN_AGENT_ADMIN_CREDENTIAL;
if (adminCredential !== undefined && adminCredential.length < 32) throw new Error("YUJIAN_AGENT_ADMIN_CREDENTIAL must be at least 32 characters");
if (process.env.NODE_ENV === "production" && adminCredential === undefined) throw new Error("YUJIAN_AGENT_ADMIN_CREDENTIAL is required in production");
const port = Number(process.env.AGENT_CONTROL_PORT ?? 8096);
const host = process.env.AGENT_CONTROL_HOST ?? "127.0.0.1";
const tlsCertFile = process.env.AGENT_CONTROL_TLS_CERT_FILE;
const tlsKeyFile = process.env.AGENT_CONTROL_TLS_KEY_FILE;
if ((tlsCertFile === undefined) !== (tlsKeyFile === undefined)) throw new Error("AGENT_CONTROL_TLS_CERT_FILE and AGENT_CONTROL_TLS_KEY_FILE must be set together");
const persistenceSpecifier = process.env.YUJIAN_AGENT_CONTROL_PERSISTENCE_MODULE;
const artifactVerifierSpecifier = process.env.YUJIAN_AGENT_ARTIFACT_VERIFIER_MODULE;
const serverPromise = Promise.all([
  loadAgentControlPersistence(persistenceSpecifier),
  loadAgentArtifactVerifier(artifactVerifierSpecifier),
]).then(([persistence, artifactVerifier]) => {
  if (process.env.NODE_ENV === "production" && persistence === undefined) throw new Error("production agent control requires a persistence adapter");
  if (process.env.NODE_ENV === "production" && artifactVerifier === undefined) throw new Error("production agent control requires an artifact verifier");
  const options: AgentControlServerOptions = {};
  if (adminCredential !== undefined) options.adminCredential = adminCredential;
  if (persistence !== undefined) options.persistence = persistence;
  if (artifactVerifier !== undefined) options.artifactVerifier = artifactVerifier;
  return tlsCertFile === undefined || tlsKeyFile === undefined
    ? createAgentControlServer(credential, undefined, options)
    : createAgentControlHttpsServer(credential, { cert: readFileSync(tlsCertFile, "utf8"), key: readFileSync(tlsKeyFile, "utf8") }, undefined, options);
});

let server: Awaited<typeof serverPromise> | undefined;
serverPromise.then((created) => {
  server = created;
  server.listen(port, host, () => process.stdout.write(`agent-control listening on ${host}:${port}\n`));
}).catch((error: unknown) => {
  process.stderr.write(`agent-control startup failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
