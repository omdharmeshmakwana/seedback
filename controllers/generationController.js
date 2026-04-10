const prisma = require("../config/prisma");
const seedance = require("../services/seedance");
const path = require("path");
const fs = require("fs");

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Storage Client (Use SERVICE_ROLE_KEY to bypass RLS, fallback to ANON_KEY)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = process.env.SUPABASE_URL && supabaseKey
  ? createClient(process.env.SUPABASE_URL, supabaseKey)
  : null;

/**
 * POST /api/generate
 * Create a new video generation (with file uploads)
 */
async function createGeneration(req, res, next) {
  try {
    const { prompt, aspectRatio, duration } = req.body;

    // Validation
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    const validRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
    if (aspectRatio && !validRatios.includes(aspectRatio)) {
      return res.status(400).json({ error: `Invalid aspect ratio. Must be one of: ${validRatios.join(", ")}` });
    }
    const dur = parseInt(duration) || 5;
    if (dur < 4 || dur > 15) {
      return res.status(400).json({ error: "Duration must be between 4 and 15 seconds" });
    }

    if (!supabase) {
      return res.status(500).json({ error: "Supabase keys missing in .env!" });
    }

    // Process uploaded files
    const imageFiles = req.files?.images || [];
    const videoFileUploads = req.files?.video || [];
    const audioFileUploads = req.files?.audio || [];

    if (imageFiles.length > 9) {
      return res.status(400).json({ error: "Maximum 9 images allowed" });
    }
    if (videoFileUploads.length > 3) {
      return res.status(400).json({ error: "Maximum 3 video files allowed" });
    }
    if (audioFileUploads.length > 3) {
      return res.status(400).json({ error: "Maximum 3 audio files allowed" });
    }

    // Helper to upload a single file to Supabase Storage
    const uploadToSupabase = async (fileObj, folder) => {
      const fileBuffer = fs.readFileSync(fileObj.path);
      const storagePath = `${folder}/${Date.now()}-${fileObj.originalname}`;
      
      const { data, error } = await supabase.storage
        .from('seedance-assets')
        .upload(storagePath, fileBuffer, {
          contentType: fileObj.mimetype,
          cacheControl: '3600',
          upsert: false
        });
        
      if (error) {
        console.error("Supabase Upload Error:", error.message);
        throw new Error(`Failed to upload to Supabase bucket. Is your bucket named 'seedance-assets' and set to Public? Error: ${error.message}`);
      }
      
      const { data: publicUrlData } = supabase.storage
        .from('seedance-assets')
        .getPublicUrl(storagePath);
        
      return publicUrlData.publicUrl;
    };

    console.log(`Uploading ${imageFiles.length} images to Supabase 'seedance-assets' bucket...`);

    // Upload files to Supabase to get public URLs
    const imagesList = [];
    for (const f of imageFiles) {
      const pubUrl = await uploadToSupabase(f, 'images');
      imagesList.push(pubUrl);
    }
    
    const videoFiles_ = [];
    for (const f of videoFileUploads) {
      const pubUrl = await uploadToSupabase(f, 'video');
      videoFiles_.push(pubUrl);
    }
    
    const audioFiles_ = [];
    for (const f of audioFileUploads) {
      const pubUrl = await uploadToSupabase(f, 'audio');
      audioFiles_.push(pubUrl);
    }

    console.log("Supabase Upload Complete. Sending Request to Seedance API...");

    // We will save the actual Supabase PUBLIC URLS into the database so the frontend can read them reliably forever 
    // even if the Render backend disk is wiped.

    // Call Seedance API with public Supabase URLs
    const apiResponse = await seedance.generateVideo({
      prompt: prompt.trim(),
      imagesList,
      videoFiles: videoFiles_,
      audioFiles: audioFiles_,
      aspectRatio: aspectRatio || "16:9",
      duration: dur,
    });

    // Check if the Seedance POST actually failed (e.g., validation failed) using our new validateStatus logic, although we haven't updated POST's validateStatus. So Axios will still throw if POST fails.
    const requestId = apiResponse.request_id || apiResponse.id || null;

    // Save to database
    const generation = await prisma.generation.create({
      data: {
        requestId,
        prompt: prompt.trim(),
        imagesList, // Using public Supabase URLs directly
        videoFiles: videoFiles_,
        audioFiles: audioFiles_,
        aspectRatio: aspectRatio || "16:9",
        duration: dur,
        status: "PENDING",
      },
    });

    res.status(201).json(generation);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/status/:requestId
 * Poll Seedance API and update DB
 */
async function getStatus(req, res, next) {
  try {
    const { requestId } = req.params;

    const generation = await prisma.generation.findFirst({
      where: { requestId },
    });

    if (!generation) {
      return res.status(404).json({ error: "Generation not found" });
    }

    if (generation.status === "COMPLETED" || generation.status === "FAILED") {
      return res.json(generation);
    }

    const result = await seedance.getResult(requestId);

    let status = "PROCESSING";
    let outputUrls = [];
    let videoPath = generation.videoPath;
    let error = null;

    // Check if MuAPI returned a 400 error wrapped in a detail object
    if (result.detail && result.detail.status === "failed") {
      status = "FAILED";
      error = result.detail.error || "Generation failed at Seedance API";
    } else if (result.status === "completed" || result.status === "succeeded") {
      status = "COMPLETED";
      outputUrls = result.outputs || result.output?.urls || [];

      // Instead of downloading to Render's ephemeral disk, we will just pass the outputUrls to the UI.
      // The frontend can stream it directly from the Seedance/Cloudfront CDN safely!
    } else if (result.status === "failed") {
      status = "FAILED";
      error = result.error || "Generation failed";
    }

    const updated = await prisma.generation.update({
      where: { id: generation.id },
      data: { status, outputUrls, videoPath, error },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/history
 */
async function getHistory(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const where = {};
    if (status && ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }
    if (search) {
      where.prompt = { contains: search, mode: "insensitive" };
    }

    const [generations, total] = await Promise.all([
      prisma.generation.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.generation.count({ where }),
    ]);

    res.json({
      data: generations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/generation/:id
 */
async function getGeneration(req, res, next) {
  try {
    const generation = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!generation) return res.status(404).json({ error: "Generation not found" });
    res.json(generation);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/retry/:id
 */
async function retryGeneration(req, res, next) {
  try {
    const generation = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!generation) return res.status(404).json({ error: "Generation not found" });
    if (generation.status !== "FAILED") return res.status(400).json({ error: "Only failed generations can be retried" });

    // For retries we just use the URLs directly from the database 
    // (since they are Supabase public URLs now!)
    const imagesList = generation.imagesList || [];
    const videoFiles = generation.videoFiles || [];
    const audioFiles = generation.audioFiles || [];

    const apiResponse = await seedance.generateVideo({
      prompt: generation.prompt,
      imagesList,
      videoFiles,
      audioFiles,
      aspectRatio: generation.aspectRatio,
      duration: generation.duration,
    });

    const requestId = apiResponse.request_id || apiResponse.id || null;

    const updated = await prisma.generation.update({
      where: { id: generation.id },
      data: { requestId, status: "PENDING", outputUrls: [], videoPath: null, error: null },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/generation/:id
 */
async function deleteGeneration(req, res, next) {
  try {
    const generation = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!generation) return res.status(404).json({ error: "Generation not found" });

    // We skip deleting local uploaded files because they were uploaded to Supabase instead
    // And Render disk resets anyway. To fully clean up, we would use Supabase Storage SDK to delete here.

    await prisma.generation.delete({ where: { id: generation.id } });
    res.json({ message: "Generation deleted successfully" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rerun/:id
 */
async function rerunGeneration(req, res, next) {
  try {
    const generation = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!generation) return res.status(404).json({ error: "Generation not found" });

    const imagesList = generation.imagesList || [];
    const videoFiles = generation.videoFiles || [];
    const audioFiles = generation.audioFiles || [];

    const apiResponse = await seedance.generateVideo({
      prompt: generation.prompt,
      imagesList,
      videoFiles,
      audioFiles,
      aspectRatio: generation.aspectRatio,
      duration: generation.duration,
    });

    const requestId = apiResponse.request_id || apiResponse.id || null;

    const newGeneration = await prisma.generation.create({
      data: {
        requestId,
        prompt: generation.prompt,
        imagesList,
        videoFiles,
        audioFiles,
        aspectRatio: generation.aspectRatio,
        duration: generation.duration,
        status: "PENDING",
      },
    });

    res.status(201).json(newGeneration);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGeneration,
  getStatus,
  getHistory,
  getGeneration,
  retryGeneration,
  deleteGeneration,
  rerunGeneration,
};
