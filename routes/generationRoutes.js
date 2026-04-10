const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/generationController");
const { uploadFields } = require("../middleware/upload");

// Generate — uses multer for file uploads
router.post("/generate", uploadFields, ctrl.createGeneration);

// Poll status
router.get("/status/:requestId", ctrl.getStatus);

// History (paginated)
router.get("/history", ctrl.getHistory);

// Single generation
router.get("/generation/:id", ctrl.getGeneration);

// Retry failed
router.post("/retry/:id", ctrl.retryGeneration);

// Rerun (duplicate and restart)
router.post("/rerun/:id", ctrl.rerunGeneration);

// Delete
router.delete("/generation/:id", ctrl.deleteGeneration);

module.exports = router;
