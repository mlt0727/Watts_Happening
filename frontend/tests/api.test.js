import assert from "node:assert/strict";
import test from "node:test";
import { fetchDashboard } from "../src/lib/api.js";

const project = { id: "Utility:1", title: "Example project", utility: "Utility" };
const company = { id: "utility", name: "Utility", aliases: ["Utility Inc."], projectIds: [project.id] };
const dashboard = {
  projects: [project],
  companies: [company],
  opportunities: [{ id: "OVL_1", location: "Example area", descProject: project, gpcProject: project, impactSummary: "Joint planning could reduce duplicate work; verify the underlying estimates." }],
  referenceAreas: {},
};

test("requests the configured backend and returns live dashboard data", async () => {
  const result = await fetchDashboard({
    baseUrl: "https://example.test/",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://example.test/api/dashboard");
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.signal.aborted, false);
      return { ok: true, json: async () => dashboard };
    },
  });
  assert.deepEqual(result, dashboard);
});

test("accepts an empty database without substituting sample records", async () => {
  const data = { opportunities: [], projects: [], companies: [], referenceAreas: {} };
  const result = await fetchDashboard({
    fetchImpl: async (url) => {
      assert.equal(url, "/api/dashboard");
      return { ok: true, json: async () => data };
    },
  });
  assert.deepEqual(result, data);
});

test("reports service failures without returning fallback projects", async () => {
  await assert.rejects(
    fetchDashboard({ fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /temporarily unavailable/,
  );
  await assert.rejects(
    fetchDashboard({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }),
    /Cannot reach the data service/,
  );
});

test("rejects invalid response shapes and incomplete opportunity projects", async () => {
  for (const data of [null, {}, { ...dashboard, companies: undefined }, { ...dashboard, opportunities: [{ id: "missing-projects" }] }]) {
    await assert.rejects(
      fetchDashboard({ fetchImpl: async () => ({ ok: true, json: async () => data }) }),
      /invalid dashboard response|incomplete project data/,
    );
  }
});

test("rejects malformed company search records and unknown project references", async () => {
  for (const record of [
    null,
    { ...company, id: 42 },
    { ...company, name: null },
    { ...company, aliases: "Utility" },
    { ...company, aliases: [42] },
    { ...company, projectIds: "Utility:1" },
    { ...company, projectIds: ["unknown-project"] },
  ]) {
    await assert.rejects(
      fetchDashboard({ fetchImpl: async () => ({ ok: true, json: async () => ({ ...dashboard, companies: [record] }) }) }),
      /invalid company search data/,
    );
  }
});

test("rejects missing, malformed, or blank backend impact summaries", async () => {
  for (const impactSummary of [undefined, null, 42, {}, "", "  \n  "]) {
    const opportunity = { ...dashboard.opportunities[0], impactSummary };
    if (impactSummary === undefined) delete opportunity.impactSummary;
    await assert.rejects(
      fetchDashboard({ fetchImpl: async () => ({ ok: true, json: async () => ({ ...dashboard, opportunities: [opportunity] }) }) }),
      /invalid impact summary/,
    );
  }
});

function abortableRequest(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    const rejectAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener("abort", rejectAbort, { once: true });
  });
}

test("forwards caller cancellation to the pending request", async () => {
  const controller = new AbortController();
  const pending = fetchDashboard({ signal: controller.signal, fetchImpl: abortableRequest });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("times out requests so the UI can offer retry", async () => {
  await assert.rejects(
    fetchDashboard({ fetchImpl: abortableRequest, timeoutMs: 5 }),
    /timed out/,
  );
});
