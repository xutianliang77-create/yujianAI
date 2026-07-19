#!/usr/bin/env node

function positive(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero`);
  return value;
}
function integer(name, fallback) {
  const value = positive(name, fallback);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

const participants = integer("YUJIAN_CAPACITY_PARTICIPANTS", 1_000);
const publishersPercent = positive("YUJIAN_CAPACITY_PUBLISHERS_PERCENT", 20);
const rtcCpuPerNode = positive("YUJIAN_CAPACITY_RTC_CPU_PER_NODE", 8);
const cpuPerParticipant = positive("YUJIAN_CAPACITY_CPU_PER_PARTICIPANT", 0.018);
const targetUtilization = Math.min(0.75, positive("YUJIAN_CAPACITY_TARGET_UTILIZATION", 0.65));
const retentionDays = integer("YUJIAN_CAPACITY_RETENTION_DAYS", 30);
const eventsPerParticipantMinute = positive("YUJIAN_CAPACITY_EVENTS_PER_PARTICIPANT_MINUTE", 4);
const participantMinutesPerDay = positive("YUJIAN_CAPACITY_PARTICIPANT_MINUTES_PER_DAY", participants * 60);
const bytesPerEvent = positive("YUJIAN_CAPACITY_BYTES_PER_EVENT", 1_024);
const usablePerRtcNode = Math.max(1, Math.floor(rtcCpuPerNode * targetUtilization / cpuPerParticipant));
const rtcNodes = Math.max(2, Math.ceil(participants / usablePerRtcNode) + 1);
const dailyLedgerBytes = participantMinutesPerDay * eventsPerParticipantMinute * bytesPerEvent;
const postgresDataGiB = Math.max(20, Math.ceil(dailyLedgerBytes * retentionDays * 1.5 / 1_073_741_824));
const redisWorkingSetMiB = Math.max(512, Math.ceil(participants * (1 + publishersPercent / 100) * 8));

const plan = {
  schemaVersion: 1,
  assumptions: { participants, publishersPercent, rtcCpuPerNode, cpuPerParticipant, targetUtilization, retentionDays, eventsPerParticipantMinute, participantMinutesPerDay, bytesPerEvent },
  topology: {
    availabilityZones: 3,
    platformApiReplicas: 3,
    rtcNodes,
    turnNodes: 3,
    postgres: { primary: 1, synchronousReplicas: 2, dataGiBPerNode: postgresDataGiB, tlsRequired: true, backupsRequired: true },
    redis: { primaryShards: 1, replicasPerShard: 2, workingSetMiB: redisWorkingSetMiB, tlsRequired: true, persistence: "aof-everysec" },
  },
  targets: { postgresRpoSeconds: 0, postgresRtoSeconds: 900, redisRpoSeconds: 1, redisRtoSeconds: 300 },
  caveat: "planning output only; benchmark, failure injection and restore evidence are required before production acceptance",
};
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
