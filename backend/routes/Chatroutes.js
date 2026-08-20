const express = require("express");
const router = express.Router();
const Chat = require("../models/Chat");
const DocumentChunk = require("../models/Documentchunk");
const { getEmbedding, generateAnswer, generateTitle } = require("../utils/Gemini");

// Simple fallback replies for greetings — RAG only kicks in for real questions
function getSimpleReply(userText) {
  const text = userText.toLowerCase().trim();

  if (["hi", "hello", "hey"].includes(text)) {
    return "Hey! 👋 Good to see you — what can I help you with today?";
  }
  if (text.includes("bye")) {
    return "Goodbye for now! 👋 Come back anytime you want to chat more.";
  }
  if (text.includes("thank")) {
    return "Anytime! 😊 Is there anything else you'd like to know?";
  }
  if (
    text.includes("who are you") ||
    text.includes("yaaru nee") ||
    text.includes("your name") ||
    text.includes("what is your name")
  ) {
    return "I'm 🤖 **Cognix AI** — your virtual assistant! What can I help you with?";
  }
  return null; // null = go ask the RAG pipeline instead
}

// Ask the RAG pipeline for a real answer, using recent conversation history
// so follow-up questions make sense. If activeDocument is set, only search
// chunks from that specific file (fetched directly, not via global vector search,
// so it never gets crowded out by other documents' chunks).
async function getRagReply(userText, history, activeDocument) {
  // combine the last couple of turns with the new question for a better
  // search — helps follow-ups like "which college he completed"
  const recentHistory = history.slice(-4).map((m) => m.text).join(" ");
  const searchQuery = `${recentHistory} ${userText}`.trim();

  const questionEmbedding = await getEmbedding(searchQuery);

  let results;

  if (activeDocument) {
    // fetch ONLY this file's chunks directly (small set), then rank them
    // locally by similarity — guarantees we never mix in other documents
    const fileChunks = await DocumentChunk.find({ sourceFile: activeDocument });

    if (fileChunks.length === 0) {
      return `I don't see anything relevant to that in **${activeDocument}**. Want to ask something else about it?`;
    }

    const cosineSimilarity = (a, b) => {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    results = fileChunks
      .map((chunk) => ({
        text: chunk.text,
        score: cosineSimilarity(questionEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  } else {
    // no specific file focused — search across everything (e.g. shared movie data)
    results = await DocumentChunk.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: questionEmbedding,
          numCandidates: 100,
          limit: 3,
        },
      },
      { $project: { text: 1 } },
    ]);
  }

  if (results.length === 0) {
    return activeDocument
      ? `I don't see anything relevant to that in **${activeDocument}**. Want to ask something else about it?`
      : "I don't have any documents to answer that yet — upload one first.";
  }

  const contextChunks = results.map((r) => r.text);
  return generateAnswer(userText, contextChunks, history);
}

// GET all chats (sidebar list) - newest first
router.get("/", async (req, res) => {
  try {
    const chats = await Chat.find().sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a new chat
router.post("/", async (req, res) => {
  try {
    const chat = await Chat.create({
      title: "New Chat",
      messages: [
        {
          sender: "bot",
          text: "Hey! 👋 What can I help you with today?",
        },
      ],
    });
    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send a message in a chat -> saves user msg + RAG bot reply, returns updated chat
router.post("/:id/messages", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }
    const trimmed = text.trim();

    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    // capture history BEFORE adding the new message, so it's true "prior" context
    const priorHistory = chat.messages.slice(-6); // last few messages for context

    chat.messages.push({ sender: "user", text: trimmed });

    const isFirstMessage = chat.title === "New Chat";

    // greetings get a quick canned reply, everything else goes through RAG
    const simpleReply = getSimpleReply(trimmed);
    const botReply =
      simpleReply !== null
        ? simpleReply
        : await getRagReply(trimmed, priorHistory, chat.activeDocument);

    chat.messages.push({ sender: "bot", text: botReply });

    await chat.save();
    res.json(chat); // respond immediately — don't make the user wait for title generation

    // generate a nicer title in the background, after the response is already sent
    if (isFirstMessage) {
      generateTitle(trimmed)
        .then(async (title) => {
          chat.title = title;
          await chat.save();
        })
        .catch((err) => {
          console.error("Background title generation failed:", err);
        });
    }
  } catch (err) {
    console.error("Message error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a chat
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Chat.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Chat not found" });
    res.json({ message: "Chat deleted", id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;