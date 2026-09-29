// k6 load test (plan §18.4): 500 concurrent citizen readers + 20 grievance writes per minute.
//
//   k6 run -e BASE_URL=https://staging.example.org tests/load/k6-load.js
//   k6 run -e BASE_URL=http://localhost:5173 -e READERS=50 -e DURATION=1m tests/load/k6-load.js   # smoke
//
// Reads exercise exactly what the public site hits (stats, project list/detail, map data, chain
// status, transparency, verify). Writes file real grievances through the gasless relayer, so run
// them only against a load/staging environment on testnet with NS_DEMO_MODE=true (demo citizens'
// one-time codes come back in the response) — never against production or mainnet.
// Set -e WRITES=0 to skip writes.
import { check, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const READERS = Number(__ENV.READERS || 500);
const DURATION = __ENV.DURATION || "5m";
const WRITES = Number(__ENV.WRITES ?? 20); // per minute
const PHONES = ["9000000001", "9000000002", "9000000003", "9000000004"];
const CONSENT_VERSION = __ENV.CONSENT_VERSION || "2026-10-01";

const jobsSubmitted = new Counter("relay_jobs_submitted");
const jobConfirmMs = new Trend("relay_job_confirm_ms", true);

export const options = {
  scenarios: {
    readers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: READERS },
        { duration: DURATION, target: READERS },
        { duration: "30s", target: 0 },
      ],
      exec: "reader",
    },
    ...(WRITES > 0
      ? {
          writers: {
            executor: "constant-arrival-rate",
            rate: WRITES,
            timeUnit: "1m",
            duration: DURATION,
            startTime: "1m", // once the readers are at full load
            preAllocatedVUs: 5,
            maxVUs: 20,
            exec: "writer",
          },
        }
      : {}),
  },
  thresholds: {
    // Public reads: fast and reliable under 500 concurrent readers.
    "http_req_duration{kind:read}": ["p(95)<800", "p(99)<2000"],
    "http_req_failed{kind:read}": ["rate<0.01"],
    // Writes return once queued; confirmation depends on the chain (3 s blocks + confirmations).
    "http_req_duration{kind:write}": ["p(95)<1500"],
    "http_req_failed{kind:write}": ["rate<0.02"],
    relay_job_confirm_ms: ["p(95)<60000"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const get = (path, name) => http.get(`${BASE}${path}`, { tags: { kind: "read", name } });

export function setup() {
  const projects = JSON.parse(http.get(`${BASE}/api/projects?limit=50`).body).items || [];
  if (projects.length === 0) throw new Error("No projects to test against — seed the environment first.");
  return { projectIds: projects.map((p) => p.id) };
}

export function reader(data) {
  const id = data.projectIds[Math.floor(Math.random() * data.projectIds.length)];
  const responses = [
    get("/api/projects/stats", "stats"),
    get("/api/projects?limit=50", "projects"),
    get("/api/projects?limit=200", "map"),
    get(`/api/projects/${id}`, "project"),
    get(`/api/milestones?projectId=${id}`, "milestones"),
    get("/api/chain/status", "chain-status"),
    get("/api/transparency", "transparency"),
    get(`/api/verify/${id}`, "verify"),
  ];
  check(responses, { "all reads 200": (rs) => rs.every((r) => r.status === 200) });
  sleep(2 + Math.random() * 4); // a citizen reads the page before the next click
}

function login(phone) {
  const send = http.post(
    `${BASE}/api/auth/otp/send`,
    JSON.stringify({ phone, consentVersion: CONSENT_VERSION }),
    { headers: { "content-type": "application/json" }, tags: { kind: "auth" } },
  );
  const devCode = send.status === 200 ? JSON.parse(send.body).devCode : null;
  if (!devCode) return null;
  const verify = http.post(
    `${BASE}/api/auth/otp/verify`,
    JSON.stringify({ phone, code: devCode, consentVersion: CONSENT_VERSION, lang: "en" }),
    { headers: { "content-type": "application/json" }, tags: { kind: "auth" } },
  );
  return verify.status === 200 ? JSON.parse(verify.body).accessToken : null;
}

export function writer(data) {
  const token = login(PHONES[__ITER % PHONES.length]);
  if (!check(token, { "demo citizen signed in": (t) => !!t })) return;

  const projectId = data.projectIds[__ITER % data.projectIds.length];
  const res = http.post(
    `${BASE}/api/grievances`,
    JSON.stringify({ projectId, category: "DELAY", text: `Load test grievance ${Date.now()} — please ignore.`, lang: "en" }),
    { headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, tags: { kind: "write" } },
  );
  if (!check(res, { "grievance accepted (202)": (r) => r.status === 202 || r.status === 200 })) return;
  jobsSubmitted.add(1);

  // Poll the relay job until the chain confirms it.
  const { jobId } = JSON.parse(res.body);
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    sleep(2);
    const job = http.get(`${BASE}/api/relay/jobs/${jobId}`, { headers: { authorization: `Bearer ${token}` }, tags: { kind: "poll" } });
    const status = job.status === 200 ? JSON.parse(job.body).status : "unknown";
    if (status === "confirmed") return void jobConfirmMs.add(Date.now() - t0);
    if (status === "failed") return void check(null, { "relay job did not fail": () => false });
  }
  check(null, { "relay job confirmed within 80 s": () => false });
}
