# RAG Node Source

A simple Retrieval-Augmented Generation (RAG) API built with Express and MongoDB Atlas Vector Search.
It reads a PDF (`docs/policy.pdf`), stores an embedding for each piece of text, and answers questions using the most relevant pieces.

The app can use two providers for the AI work:

| Job | Where it happens | Providers |
|---|---|---|
| **Embeddings** (text → vector) | `/load-document`, and the question in `/conversation` | `gemini`, `ollama` |
| **Chat** (writes the answer) | `/conversation` | `gemini`, `ollama`, `ollama-cloud` |

You choose each one separately, so you can mix them. For example, local Ollama for embeddings and Gemini for chat.

---

## Using Ollama

[Ollama](https://ollama.com) runs open-source models on your own machine and serves them over a local HTTP API at `http://localhost:11434`.

**Why use it here?**
- **No rate limits or cost.** Loading the PDF makes one embedding call per line, about 1,700 calls. Gemini's free tier can't handle that, so with Gemini the app reads only 2 pages. With local Ollama it reads the whole PDF.
- **Private.** Your documents never leave your machine.
- **Works offline.**

The trade-off: local models are smaller than Gemini, so the answers may be less polished, and speed depends on your hardware.

### 1. Install Ollama

**Linux**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```
The installer sets Ollama up as a background service (systemd).

**macOS**: download the app from [ollama.com/download](https://ollama.com/download), or run:
```bash
brew install ollama
ollama serve      # only needed with the brew install; the app starts the server itself
```

**Windows**: download and run the installer from [ollama.com/download](https://ollama.com/download).

**Docker**
```bash
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
# then prefix the commands below with: docker exec -it ollama
```

Check that it's installed:
```bash
ollama --version
curl http://localhost:11434        # should print "Ollama is running"
```

### 2. Pull the models

```bash
ollama pull nomic-embed-text   # embedding model, ~274 MB, outputs 768-dim vectors
ollama pull llama3.2           # chat model, ~2 GB
ollama list                    # both should be listed
```

These are the defaults in [config.js](config.js). To use other models, pull them and set `OLLAMA_EMBED_MODEL` / `OLLAMA_CHAT_MODEL` in `.env`.

Test both models directly:
```bash
# Embedding: returns {"embeddings":[[0.01, -0.03, ...]]}
curl http://localhost:11434/api/embed -d '{"model":"nomic-embed-text","input":"search_query: hello"}'

# Chat
curl http://localhost:11434/api/generate -d '{"model":"llama3.2","prompt":"Say hi","stream":false}'
```

### 3. Configure `.env`

```env
DB=mongodb+srv://<user>:<password>@<cluster>/   # MongoDB Atlas connection string

EMBEDDING_PROVIDER=ollama     # gemini | ollama
CHAT_PROVIDER=ollama          # gemini | ollama | ollama-cloud

# Optional overrides (defaults shown)
# OLLAMA_URL=http://localhost:11434
# OLLAMA_EMBED_MODEL=nomic-embed-text
# OLLAMA_CHAT_MODEL=llama3.2
# EMBEDDING_DIMENSIONS=768
# MAX_PDF_PAGES=            # local Ollama default: all pages; Gemini default: 2

# Only needed if a provider above is gemini
# GEMINI_API_KEY=...

# Only needed for CHAT_PROVIDER=ollama-cloud
# OLLAMA_API_KEY=...
# OLLAMA_CLOUD_CHAT_MODEL=gpt-oss:120b
```

Common combinations:

| Setup | `EMBEDDING_PROVIDER` | `CHAT_PROVIDER` | Needs |
|---|---|---|---|
| Fully local, free | `ollama` | `ollama` | Ollama running |
| Local search, better answers | `ollama` | `gemini` | Ollama + `GEMINI_API_KEY` |
| Local search, big open model, no GPU needed | `ollama` | `ollama-cloud` | Ollama + `OLLAMA_API_KEY` |
| Fully Gemini | `gemini` | `gemini` | `GEMINI_API_KEY` |

### 4. Create the Atlas vector index

In Atlas, open your cluster, go to **Search & Vector Search**, and create a **Vector Search** index:
- Database: `rag_doc`
- Collection: `docs`
- Index name: `vector_index`

Use this definition:
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" }
  ]
}
```

`numDimensions` must equal `EMBEDDING_DIMENSIONS` (768 by default). Both `nomic-embed-text` and the app's Gemini setting produce 768-dimension vectors.

> ⚠️ **Switching the embedding provider or model? Empty the `docs` collection and re-load the document.**
> Each embedding model maps text into its own vector space. A question embedded with nomic can't be meaningfully compared to chunks embedded with Gemini, even when both vectors have 768 numbers. Search won't fail with an error; it will quietly return the wrong text.
> Changing only `CHAT_PROVIDER` is always safe. The chat model never sees vectors.

### 5. Run the app

```bash
npm install
npm start                      # http://localhost:3000
```

**Load the PDF** (embeds every line and stores it in `docs`):
```bash
curl -X POST http://localhost:3000/load-document
```
Each line is logged as it's stored. Re-running this adds duplicates, so empty the `docs` collection first.

**Ask a question:**
```bash
curl -X POST http://localhost:3000/conversation \
  -H "Content-Type: application/json" \
  -d '{"message": "Is ambulance cover included?"}'
```
To continue the same session, pass back `"sessionId"`. The same requests are in [rag_node_source.postman_collection.json](rag_node_source.postman_collection.json).

**Check that embeddings work:**
```bash
curl http://localhost:3000/embeddings
```

---

## How the Ollama integration works

No SDK is needed. The app calls Ollama's REST API with Node's built-in `fetch`.

**Embeddings**: [routes/embedings.js](routes/embedings.js) calls `POST /api/embed`.
- `nomic-embed-text` was trained to expect a task prefix, so the app adds `search_document: ` to PDF lines and `search_query: ` to questions. Without the prefixes, retrieval quality drops noticeably. This is the same idea as Gemini's `taskType` (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`).
- The Ollama response is reshaped to match Gemini's (`{ embeddings: [{ values }] }`), so [routes/index.js](routes/index.js) works the same with either provider.

**Chat**: [routes/llm.js](routes/llm.js) calls `POST /api/generate` with `stream: false`, which returns the full answer in one response.

**Ollama Cloud**: this uses the exact same API at `https://ollama.com`, with an `Authorization: Bearer <OLLAMA_API_KEY>` header. Large models like `gpt-oss:120b` run on Ollama's servers instead of your machine. To get a key, sign in at [ollama.com](https://ollama.com) and go to **Settings → Keys**. Ollama Cloud is chat only: it has no embedding models, so embeddings still use local Ollama or Gemini.

---

## Troubleshooting

| Error / symptom | Fix |
|---|---|
| `fetch failed` / `ECONNREFUSED 127.0.0.1:11434` | Ollama isn't running. Linux: `sudo systemctl start ollama`. macOS/brew: `ollama serve`. Docker: `docker start ollama`. |
| `Ollama embedding failed (404) ... model "nomic-embed-text" not found` | Run `ollama pull nomic-embed-text` (same fix for the chat model). |
| Atlas error about vector dimensions | `numDimensions` in the index doesn't match `EMBEDDING_DIMENSIONS`. |
| Search runs but returns unrelated text | The `docs` collection was loaded with a different embedding model. Empty it and re-load. |
| `OLLAMA_API_KEY is missing` | You set `CHAT_PROVIDER=ollama-cloud` without adding a key. |
| Answers are slow | The first request loads the model into memory (watch it with `ollama ps`). Later requests are faster. A smaller model or a GPU also helps. |
| Ollama runs on another machine | Set `OLLAMA_URL=http://<host>:11434`, and start Ollama there with `OLLAMA_HOST=0.0.0.0`. |
