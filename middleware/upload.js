const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = file.fieldname === "images" ? "images" : file.fieldname === "video" ? "video" : "audio";
    const dir = path.join(UPLOADS_DIR, subDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "images") {
    const allowed = /\.(jpg|jpeg|png|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Images must be JPEG, PNG, or WebP"), false);
    }
  } else if (file.fieldname === "video") {
    const allowed = /\.(mp4|mov|webm)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Video must be MP4, MOV, or WEBM"), false);
    }
  } else if (file.fieldname === "audio") {
    const allowed = /\.(mp3|wav|m4a|ogg)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Audio must be MP3, WAV, M4A, or OGG"), false);
    }
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file to allow short videos
    files: 15, // max 9 images + 3 video + 3 audio
  },
});

const uploadFields = upload.fields([
  { name: "images", maxCount: 9 },
  { name: "video", maxCount: 3 },
  { name: "audio", maxCount: 3 },
]);

module.exports = { uploadFields, UPLOADS_DIR };
