// routes/api.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {compareImages} from '../services/comapre.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
const router = express.Router();


// API endpoint to upload and process images
router.post('/compare', upload.fields([
  { name: 'image1Path', maxCount: 1 },
  { name: 'image2Path', maxCount: 1 }
]), async (req, res) => {
  try {
    const image1Path = req.files.image1Path[0].path;
    const image2Path = req.files.image2Path[0].path;

    const result = await compareImages(image1Path, image2Path);

    if (!result.highlightedImagePath) {
      return res.status(500).json({ 
        error: 'Failed to generate highlighted image',
        analysis: result.analysis,
        differences: result.differences 
      });
    }

    // Send back both the analysis and the highlighted image path
    res.json({
      analysis: result.analysis,
      differences: result.differences,
      highlightedImagePath: '/outputs/' + path.basename(result.highlightedImagePath)
    });

  } catch (error) {
    console.error('Error processing comparison:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


export { router };