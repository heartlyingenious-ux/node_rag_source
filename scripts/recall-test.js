// Usage: node scripts/recall-test.js
const { embed } = require("../providers/embeddings");
const { searchDocs } = require("../services/retrieval");
const { closeDb } = require("../lib/db");

const LIMIT = 10;
const CANDIDATES = [10, 20, 50, 150];
const QUESTIONS = [
  "Is ambulance cover included?",
  "What is the definition of accident?",
  "What is the waiting period for pre-existing diseases?",
  "What documents are needed to file a claim?",
  "What is the grace period for renewal?",
];

async function timed(fn) {
  const start = performance.now();
  const result = await fn();
  return [result, performance.now() - start];
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

(async () => {
  const stats = Object.fromEntries(CANDIDATES.map((c) => [c, { recall: [], ms: [] }]));
  const exactMs = [];

  for (const question of QUESTIONS) {
    const vector = await embed(question, "RETRIEVAL_QUERY");
    // minScore: 0 so the threshold doesn't distort the comparison
    const [exact, ms] = await timed(() =>
      searchDocs(vector, { limit: LIMIT, exact: true, minScore: 0 }),
    );
    exactMs.push(ms);
    const truth = new Set(exact.map((d) => d.text));

    for (const numCandidates of CANDIDATES) {
      const [approx, ms] = await timed(() =>
        searchDocs(vector, { limit: LIMIT, numCandidates, minScore: 0 }),
      );
      const found = approx.filter((d) => truth.has(d.text)).length;
      stats[numCandidates].recall.push(found / LIMIT);
      stats[numCandidates].ms.push(ms);
    }
  }

  console.table([
    ...CANDIDATES.map((c) => ({
      search: `ANN numCandidates=${c}`,
      "recall@10": avg(stats[c].recall).toFixed(2),
      "avg ms": avg(stats[c].ms).toFixed(1),
    })),
    { search: "exact (brute force)", "recall@10": "1.00", "avg ms": avg(exactMs).toFixed(1) },
  ]);
  await closeDb();
})();
