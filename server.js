require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const errorHandler = require("./middleware/errorHandler");
const generationRoutes = require("./routes/generationRoutes");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve uploaded files (images/audio)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve downloaded videos
app.use("/videos", express.static(path.join(__dirname, "videos")));

// API routes
app.use("/api", generationRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Seedance backend running on http://localhost:${PORT}`);
});

module.exports = app;
