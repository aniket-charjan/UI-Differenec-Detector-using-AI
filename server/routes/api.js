// routes/api.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { getBase64Image } from '../utils/compare.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize the Anthropic SDK
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  { name: 'baselineImage', maxCount: 1 },
  { name: 'comparisonImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const baselineImagePath = req.files.baselineImage[0].path;
    const comparisonImagePath = req.files.comparisonImage[0].path;
    // const comparisonName = req.body.name || `Comparison-${Date.now()}`;


    const baselineImageData = await getBase64Image(baselineImagePath);
    const comparisonImageData = await getBase64Image(comparisonImagePath);
    
    // Process the comparison
    // const result = await analyzeScreenshots(baselineImagePath, comparisonImagePath, comparisonName);
    const message = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: baselineImageData, // Base64-encoded image data as string
              }
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: comparisonImageData, // Base64-encoded image data as string
              }
            },
            {
              type: "text",
              text: "Describe this image."
            }
          ]
        }
      ]
    });
      
    console.log(message);
    
    res.json({
      success: true,
      ...message
    });
  } catch (error) {
    console.error('Error processing comparison:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* // API endpoint to get comparison results
router.get('/comparison/:id', async (req, res) => {
  try {
    const comparisonId = req.params.id;
    const result = await getComparisonById(comparisonId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Comparison not found' });
    }
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error retrieving comparison:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all comparisons
router.get('/comparisons', async (req, res) => {
  try {
    const comparisons = await getAllComparisons();
    res.json({
      success: true,
      comparisons
    });
  } catch (error) {
    console.error('Error retrieving comparisons:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}); */


export { router };