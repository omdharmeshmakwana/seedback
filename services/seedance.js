const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.muapi.ai/api/v1";
const VIDEOS_DIR = path.join(__dirname, "..", "videos");

// Ensure videos directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

/**
 * Submit a video generation request to Seedance API
 */
async function generateVideo({ prompt, imagesList, videoFiles, audioFiles, aspectRatio, duration }) {
  const response = await axios.post(
    `${API_BASE}/seedance-2.0-omni-reference`,
    {
      prompt,
      images_list: imagesList || [],
      video_files: videoFiles || [],
      audio_files: audioFiles || [],
      aspect_ratio: aspectRatio || "16:9",
      quality: "high",
      duration: duration || 5,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.MUAPI_API_KEY,
      }
    }
  );

  return response.data;
}

/**
 * Poll Seedance API for generation result
 */
async function getResult(requestId) {
  const response = await axios.get(
    `${API_BASE}/predictions/${requestId}/result`,
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.MUAPI_API_KEY,
      },
      validateStatus: (status) => status < 500 // Don't throw on 4xx so we can check the error payload
    }
  );

  return response.data;
}

/**
 * Download a video from URL and save locally
 * Returns the local filename
 */
async function downloadVideo(videoUrl, requestId) {
  const ext = path.extname(new URL(videoUrl).pathname) || ".mp4";
  const filename = `${requestId}${ext}`;
  const filepath = path.join(VIDEOS_DIR, filename);

  const response = await axios.get(videoUrl, {
    responseType: "stream"
  });

  const writer = fs.createWriteStream(filepath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(filename));
    writer.on("error", reject);
  });
}

module.exports = { generateVideo, getResult, downloadVideo };
