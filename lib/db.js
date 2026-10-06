const { MongoClient } = require("mongodb");
const config = require("../config");

// One client for the whole app. It keeps a connection pool and connects
// lazily on the first operation, so routes never connect or close themselves.
const client = new MongoClient(config.mongo.url);

function getDb() {
  return client.db(config.mongo.dbName);
}

async function ping() {
  await getDb().command({ ping: 1 });
}

// Regular (non-vector) indexes. The Atlas vector index is created in the Atlas UI.
async function ensureIndexes() {
  await getDb().collection("conversation").createIndex({ sessionId: 1, createdAt: 1 });
}

async function closeDb() {
  await client.close();
}

module.exports = {
  getDb,
  ping,
  ensureIndexes,
  closeDb,
};
