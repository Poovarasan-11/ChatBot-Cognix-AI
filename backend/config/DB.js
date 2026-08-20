const mongoose = require("mongoose");
const dns = require("dns");
 
// Force Google's DNS for this app only — fixes "querySrv ECONNREFUSED"
// when your ISP/network's default DNS can't resolve Atlas's SRV records.
// This does NOT touch your Windows network settings.
dns.setServers(["8.8.8.8", "8.8.4.4"]);
 
async function connectDB() {
  try {
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatbot";
 
    await mongoose.connect(uri);
 
    console.log("✅ MongoDB connected:", mongoose.connection.host);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1); // stop the server if DB can't connect
  }
}
 
// Optional: log unexpected disconnects (useful once RAG jobs are hitting the DB too)
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected");
});
 
module.exports = connectDB;