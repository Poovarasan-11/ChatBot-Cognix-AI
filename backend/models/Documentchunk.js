const mongoose = require("mongoose");
 
const documentChunkSchema = new mongoose.Schema(
  {
    sourceFile: { type: String, required: true }, // original filename
    text: { type: String, required: true }, // the chunk of text
    embedding: { type: [Number], required: true }, // vector from Gemini
  },
  { timestamps: true }
);
 
module.exports = mongoose.model("DocumentChunk", documentChunkSchema);