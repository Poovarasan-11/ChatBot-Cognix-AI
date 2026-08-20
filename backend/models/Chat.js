const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ["user", "bot"], required: true },
    text: { type: String, required: true },
    attachment: { type: String, default: null }, // base64 image data URL, if this message has an image
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    title: { type: String, default: "New Chat" },
    messages: [messageSchema],
    activeDocument: { type: String, default: null }, // filename this chat is currently focused on
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);