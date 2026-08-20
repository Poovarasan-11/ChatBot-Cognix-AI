require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/DB");
const chatRoutes = require("./routes/Chatroutes");
const ragRoutes = require("./routes/Ragroutes");
 
const app = express();
app.use(cors());
app.use(express.json());
 
connectDB();
 
app.get("/", (req, res) => {
  res.send("Chatbot backend is running 🚀");
});
 
app.use("/api/chats", chatRoutes);
app.use("/api/rag", ragRoutes);
 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});