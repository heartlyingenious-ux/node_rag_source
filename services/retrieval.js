const config = require("../config");
const { getDb } = require("../lib/db");

/**
 * Find the stored chunks closest to a query vector.
 * Returns [{ text, score }] ordered by score (highest first).
 */
async function searchDocs(queryVector, { limit = 10, numCandidates = 150 } = {}) {
  return getDb()
    .collection("docs")
    .aggregate([
      {
        $vectorSearch: {
          index: config.mongo.vectorIndex,
          path: "embedding",
          queryVector,
          numCandidates,
          limit,
        },
      },
      {
        $project: {
          _id: 0,
          text: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
}

module.exports = {
  searchDocs,
};
