var express = require("express");
var router = express.Router();
const { MongoClient, ObjectId } = require("mongodb");
const { createEmbedings } = require("./embedings");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

var PDFParser = require("pdf2json");
const parser = new PDFParser(this, 1);

/* GET home page. */
router.get("/", async function (req, res, next) {
  try {
    const connection = await MongoClient.connect(process.env.DB);
    const db = connection.db("rag_doc");
    const collection = db.collection("docs");
    await collection.insertOne({ test: "Success" });
    await connection.close();
    res.json({ title: "Express" });
  } catch (error) {
    console.log(error);
  }
});

router.post("/load-document", async (req, res) => {
  try {
    parser.once("pdfParser_dataError", (error) => {
      console.error("PDF parse error:", error);
      return res.status(500).json({ message: "Failed to parse PDF document." });
    });

    parser.once("pdfParser_dataReady", async (data) => {
      try {
        // Only keep the first two pages of the PDF
        const MAX_PAGES = 2;
        const pages = parser
          .getRawTextContent()
          .split(/\r?\n-+Page \(\d+\) Break-+\r?\n/);
        const limitedText = pages.slice(0, MAX_PAGES).join("\n");

        await fs.writeFileSync("./context.txt", limitedText);

        const content = await fs.readFileSync("./context.txt", "utf-8");
        const splitContent = content.split("\n");

        const connection = await MongoClient.connect(process.env.DB);
        const db = connection.db("rag_doc");
        const collection = db.collection("docs");

        for (const line of splitContent) {
          if (!line || !line.trim()) continue;

          try {
            const embedings = await createEmbedings(line);
            await collection.insertOne({
              text: line,
              embedding: embedings.embeddings[0].values,
            });
            console.log(line);
          } catch (error) {
            console.error(`Skipping line due to embedding failure: ${line.slice(0, 120)}`);
            continue;
          }
        }

        await connection.close();
        return res.json("Done");
      } catch (error) {
        console.error("Document load error:", error);
        return res.status(500).json({
          message: error.message || "Error while loading document.",
        });
      }
    });

    parser.loadPDF("./docs/policy.pdf");
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error" });
  }
});

router.get("/embeddings", async (req, res) => {
  try {
    const embedings = await createEmbedings("Hello World");
    res.json(embedings);
  } catch (error) {
    console.log(error);
    res.status(500).json({ meesage: "Error" });
  }
});

router.post("/conversation", async (req, res) => {
  try {
    let sessionId = req.body.sessionId;
    const connection = await MongoClient.connect(process.env.DB);
    const db = connection.db("rag_doc");

    if (!sessionId) {
      const collection = db.collection("sessions");
      const sessionData = await collection.insertOne({ createdAt: new Date() });
      sessionId = sessionData._id;
    }

    if (sessionId) {
      const collection = db.collection("sessions");
      const sessionData = await collection.findOne({
        _id: new ObjectId(sessionId),
      });
      if (sessionData) {
        sessionId = sessionData._id;
      } else {
        return res.json({
          message: "Session Not Found",
        });
      }
    }

    // Lets work conversation
    const message = req.body.message;
    const conCollection = db.collection("conversation");
    await conCollection.insertOne({
      sessionId: sessionId,
      message: message,
      role: "USER",
      createdAt: new Date(),
    });

    // Convert message to vector
    console.log(req.body.message);
    const messageVector = await createEmbedings(
      req.body.message,
      "RETRIEVAL_QUERY",
    );

    const docsCollection = db.collection("docs");
    const vectorSearch = await docsCollection.aggregate([
      {
        $vectorSearch: {
          index: "default",
          path: "embedding",
          queryVector: messageVector.embeddings[0].values,
          numCandidates: 150,
          limit: 10,
        },
      },
      {
        $project: {
          _id: 0,
          text: 1,
          score: {
            $meta: "vectorSearchScore",
          },
        },
      },
    ]);

    let finalResult = [];

    for await (let doc of vectorSearch) {
      finalResult.push(doc);
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const context = finalResult.map((doc) => doc.text).join("\n");

    const prompt = `
        You are a humble helper who answers questions using the provided context.

        Context:
        ${context}

        Question:
        ${message}

        Answer the question using only the information provided in the context.
        `;

    const chat = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    console.log(prompt);

    return res.json(chat.text);
  } catch (error) {
    res.json({ message: "Something went wrong" });
    console.log(error);
  }
});

module.exports = router;
