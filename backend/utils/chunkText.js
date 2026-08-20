// Splits text into chunks of ~chunkSize characters, with a small overlap
// so we don't lose context at chunk boundaries.
function chunkText(text, chunkSize = 1000, overlap = 150) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks = [];
 
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    start += chunkSize - overlap;
  }
 
  return chunks;
}
 
module.exports = chunkText;
