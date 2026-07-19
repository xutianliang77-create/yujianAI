import { OwnerApprovalService } from "./approval-service.js";
import { OwnerApprovalCatalog } from "./catalog.js";
import { loadOwnerApprovalConfig } from "./config.js";
import { OwnerApprovalEvidenceStore } from "./evidence-store.js";
import { OpenBaoOwnerSigner } from "./openbao-signer.js";
import { createOwnerApprovalServer } from "./server.js";

const config = loadOwnerApprovalConfig();
const catalog = await OwnerApprovalCatalog.load(config.templateRoot, config.keyRegistryPath);
const evidence = new OwnerApprovalEvidenceStore(config.evidenceRoot);
await evidence.prepare();
const service = new OwnerApprovalService(catalog, evidence, new OpenBaoOwnerSigner(config.openBaoAddresses));
const server = createOwnerApprovalServer(config, service);

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    level: "info",
    service: "@yujian/owner-approval",
    event: "listening",
    host: config.host,
    port: config.port,
    tls: config.tls !== undefined,
  }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
