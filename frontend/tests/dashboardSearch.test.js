import assert from "node:assert/strict";
import test from "node:test";
import { searchDashboard } from "../src/lib/dashboardSearch.js";

test("finds companies by aliases with case, accent, and punctuation normalization", () => {
  const company = { id: "metc", name: "Michigan Electric Transmission Company", aliases: ["MÉTC (ITC)"] };
  const unrelated = { id: "other", name: "Other Utility", aliases: [] };
  assert.deepEqual(searchDashboard([company, unrelated], [], "metc-itc"), [
    { kind: "company", item: company },
  ]);
});

test("finds projects by title without matching their area, ID, or utility", () => {
  const project = { id: "999", title: "Rebuild Battle Creek – Oneida", area: "Michigan", utility: "Utility A" };
  assert.deepEqual(searchDashboard([], [project], "BATTLE creek"), [
    { kind: "project", item: project },
  ]);
  for (const query of ["Michigan", "999", "Utility A"]) {
    assert.deepEqual(searchDashboard([], [project], query), []);
  }
});

test("returns both result kinds with companies first and preserves item identity", () => {
  const company = { id: "same-id", name: "Oneida Energy", aliases: ["Oneida Power"] };
  const project = { id: "same-id", title: "Battle Creek - Oneida" };
  const results = searchDashboard([company], [project], "Oneida");
  assert.deepEqual(results.map(({ kind }) => kind), ["company", "project"]);
  assert.equal(results[0].item, company);
  assert.equal(results[1].item, project);
});

test("empty or punctuation-only searches return no suggestions", () => {
  const companies = [{ id: "a", name: "Utility A", aliases: [] }];
  const projects = [{ id: "p", title: "Project A" }];
  for (const query of ["", "   ", " -- / "]) {
    assert.deepEqual(searchDashboard(companies, projects, query), []);
  }
});
