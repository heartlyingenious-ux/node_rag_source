const { ObjectId } = require("mongodb");
const createError = require("http-errors");
const logger = require("../lib/logger");
const { getDb } = require("../lib/db");
const { embed } = require("../providers/embeddings");
const { generateAnswer } = require("../providers/llm");
const { searchDocs } = require("./retrieval");

// Returns the session's ObjectId, creating a new session when none is given
async function resolveSession(sessionId) {
  const sessions = getDb().collection("sessions");

  if (!sessionId) {
    const { insertedId } = await sessions.insertOne({ createdAt: new Date() });
    return insertedId;
  }

  if (!ObjectId.isValid(sessionId)) {
    throw createError(400, "sessionId is not a valid id");
  }
  const session = await sessions.findOne({ _id: new ObjectId(sessionId) });
  if (!session) throw createError(404, "Session not found");
  return session._id;
}

function saveMessage(sessionId, role, message) {
  return getDb()
    .collection("conversation")
    .insertOne({ sessionId, role, message, createdAt: new Date() });
}

function buildPrompt(context, question) {
  return `
You are a humble helper who answers questions using the provided context.

Context:
${context}

Question:
${question}

Answer the question using only the information provided in the context.
`;
}

async function ask({ message, sessionId }) {
  const session = await resolveSession(sessionId);
  await saveMessage(session, "USER", message);

  const queryVector = await embed(message, "RETRIEVAL_QUERY");
  const sources = await searchDocs(queryVector);

  const prompt = buildPrompt(sources.map((doc) => doc.text).join("\n"), message);
  logger.debug({ prompt }, "Prompt sent to LLM");

  const answer = await generateAnswer(prompt);
  await saveMessage(session, "ASSISTANT", answer);

  return { sessionId: session, answer, sources };
}

module.exports = {
  ask,
};
