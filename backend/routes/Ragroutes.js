const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const { PDFParse } = require("pdf-parse");

const router = express.Router();
const Chat = require("../models/Chat");
const DocumentChunk = require("../models/Documentchunk");
const chunkText = require("../utils/chunkText");
const { getEmbedding, generateAnswer, describeImage } = require("../utils/Gemini");

// store uploaded file in memory (not saved to disk)
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/rag/upload - upload a PDF, DOCX, TXT, or image, extract + chunk + embed + store
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { originalname, buffer, mimetype } = req.file;
    const { chatId } = req.body; // which chat this upload belongs to (if any)
    let rawText = "";

    if (mimetype === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      rawText = result.text;
    } else if (
      mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const parsed = await mammoth.extractRawText({ buffer });
      rawText = parsed.value;
    } else if (mimetype === "text/plain") {
      rawText = buffer.toString("utf-8");
    } else if (
      ["image/jpeg", "image/png", "image/webp"].includes(mimetype)
    ) {
      // Use Gemini's vision to transcribe any text in the image (documents,
      // certificates, screenshots) or describe it (normal photos)
      rawText = await describeImage(buffer, mimetype);
    } else {
      return res
        .status(400)
        .json({ error: "Only PDF, DOCX, TXT, JPG, and PNG files are supported" });
    }

    if (!rawText.trim()) {
      return res.status(400).json({
        error:
          "No readable text found in file. If this was a photo, make sure the text in it is clear and readable.",
      });
    }

    const chunks = chunkText(rawText);

    // embed + save each chunk (sequential to avoid rate-limit issues)
    const savedChunks = [];
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      const saved = await DocumentChunk.create({
        sourceFile: originalname,
        text: chunk,
        embedding,
        chatId: chatId || null,
      });
      savedChunks.push(saved._id);
    }

    // if this upload happened inside a specific chat, focus that chat on this file
    if (chatId) {
      const chat = await Chat.findById(chatId);
      if (chat) {
        chat.activeDocument = originalname;

        // show the upload itself as a "user" message — with an inline image
        // preview if it's a photo, or just the filename for documents
        const isImage = ["image/jpeg", "image/png", "image/webp"].includes(mimetype);
        chat.messages.push({
          sender: "user",
          text: isImage ? `📷 ${originalname}` : `📎 ${originalname}`,
          attachment: isImage
            ? `data:${mimetype};base64,${buffer.toString("base64")}`
            : null,
        });

        chat.messages.push({
          sender: "bot",
          text: `Got it — I've read **${originalname}**. Ask me anything about it!`,
        });
        await chat.save();
      }
    }

    res.json({
      message: "File processed successfully",
      fileName: originalname,
      chunksCreated: savedChunks.length,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rag/ask - ask a question, answered using the stored documents
router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    const questionEmbedding = await getEmbedding(question.trim());

    const results = await DocumentChunk.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: questionEmbedding,
          numCandidates: 100,
          limit: 5,
        },
      },
      {
        $project: {
          text: 1,
          sourceFile: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    if (results.length === 0) {
      return res.json({
        answer:
          "I don't have any documents to answer that yet — upload one first.",
        sources: [],
      });
    }

    const contextChunks = results.map((r) => r.text);
    const answer = await generateAnswer(question.trim(), contextChunks);

    res.json({
      answer,
      sources: results.map((r) => ({ file: r.sourceFile, score: r.score })),
    });
  } catch (err) {
    console.error("Ask error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rag/feed - feed raw text directly (no file needed)
router.post("/feed", async (req, res) => {
  try {
    const { sourceName, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    const chunks = chunkText(text);

    const savedChunks = [];
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      const saved = await DocumentChunk.create({
        sourceFile: sourceName || "Manual Feed",
        text: chunk,
        embedding,
      });
      savedChunks.push(saved._id);
    }

    res.json({
      message: "Text fed successfully",
      sourceName: sourceName || "Manual Feed",
      chunksCreated: savedChunks.length,
    });
  } catch (err) {
    console.error("Feed error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;