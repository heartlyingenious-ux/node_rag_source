const config = require("../config");
const { getDb } = require("../lib/db");

/**
 * Find the stored chunks closest to a query vector.
 * Returns [{ text, score }] ordered by score (highest first).
 */
async function searchDocs(
  queryVector,
  { limit = 10, numCandidates = 150, exact = false, minScore = config.minScore } = {},
) {
  const vectorSearch = { index: config.mongo.vectorIndex, path: "embedding", queryVector, limit };
  // Atlas rejects numCandidates when exact is true: brute force has no candidate list
  if (exact) vectorSearch.exact = true;
  else vectorSearch.numCandidates = numCandidates;
  return getDb()
    .collection("docs")
    .aggregate([
      { $vectorSearch: vectorSearch },
      { $project: { _id: 0, text: 1, score: { $meta: "vectorSearchScore" } } },
      // Vector search always returns the nearest neighbours, relevant or not.
      // Dropping weak matches can return fewer than `limit` results, which is the point.
      { $match: { score: { $gte: minScore } } },
    ])
    .toArray();
}

module.exports = {
  searchDocs,
};
