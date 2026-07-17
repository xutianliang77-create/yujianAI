#!/usr/bin/env node

function number(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero`);
  return value;
}

const rtcCpu = number("RTC_CPU_CORES", 8);
const cpuPerParticipant = number("CPU_PER_PARTICIPANT", 0.018);
const targetUtilization = Math.min(0.8, number("TARGET_UTILIZATION", 0.65));
const participantsPerNode = Math.floor((rtcCpu * targetUtilization) / cpuPerParticipant);
const requestedParticipants = number("REQUESTED_PARTICIPANTS", participantsPerNode);
const nodes = Math.ceil(requestedParticipants / participantsPerNode);

console.log(JSON.stringify({
  assumptions: { rtcCpu, cpuPerParticipant, targetUtilization },
  requestedParticipants,
  participantsPerNode,
  rtcNodes: nodes,
  recommendedAvailabilityZones: Math.max(2, Math.min(nodes, 3)),
}, null, 2));
