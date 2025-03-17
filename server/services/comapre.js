import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import { createCanvas, loadImage } from 'canvas';
import path from 'path';
import { ensureOutputDir } from '../utils/compare.js';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Compare two images and generate a report with highlighted differences
async function compareImages(image1Path, image2Path) {
  try {
    // Read image files
    const image1Buffer = await fs.readFile(image1Path);
    const image2Buffer = await fs.readFile(image2Path);
    
    // Convert to base64
    const base64Image1 = image1Buffer.toString('base64');
    const base64Image2 = image2Buffer.toString('base64');
    
    // Ask Claude to analyze the differences
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Compare these two website screenshots and provide a detailed analysis of all UI differences. Focus on:\n\n1. Text changes (different wording, punctuation, etc.)\n2. Button text or appearance changes\n3. Layout differences\n4. Element additions or removals\n5. Color or style changes\n\nExplain each difference clearly and provide a JSON summary in the following format:\n```json\n{\n  \"differences\": [\n    {\n      \"type\": \"text_change\",\n      \"location\": \"header\",\n      \"description\": \"Question mark changed to exclamation mark\",\n      \"coordinates\": {\"x1\": 123, \"y1\": 456, \"x2\": 789, \"y2\": 101},\n      \"before\": \"text before\",\n      \"after\": \"text after\"\n    },\n    // more differences...\n  ]\n}\n```\n\nInclude the coordinates (bounding box) for each change so I can highlight them in the UI."
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image1
              }
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image2
              }
            }
          ]
        }
      ]
    });

    // Extract the response text
    const content = response.content[0].text;
    
    // Find JSON in the response
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    
    let differences = null;
    if (jsonMatch && jsonMatch[1]) {
      differences = JSON.parse(jsonMatch[1]);
    } else {
      // Try to find any JSON in the response
      const jsonRegex = /\{[\s\S]*?\}/g;
      const matches = content.match(jsonRegex);
      if (matches) {
        try {
          differences = JSON.parse(matches[0]);
        } catch (e) {
          console.error("Failed to parse JSON from response:", e);
        }
      }
    }
    
    // Generate highlighted image
    const outputPath = await createHighlightedImage(image2Path, differences);
    
    return {
      differences,
      analysis: content,
      highlightedImagePath: outputPath
    };
  } catch (error) {
    console.error("Error comparing images:", error);
    throw error;
  }
}

// Create an image with highlighted differences
async function createHighlightedImage(imagePath, differences) {
  if (!differences || !differences.differences) {
    console.error("No differences data to highlight");
    return null;
  }

  try {
    // Load the original image
    const image = await loadImage(imagePath);
    
    // Create a canvas with the same dimensions as the image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original image
    ctx.drawImage(image, 0, 0);
    
    // Set highlighting style
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    
    // Highlight each difference
    differences.differences.forEach(diff => {
      if (diff.coordinates) {
        const { x1, y1, x2, y2 } = diff.coordinates;
        const width = x2 - x1;
        const height = y2 - y1;
        
        // Draw rectangle
        ctx.strokeRect(x1, y1, width, height);
        ctx.fillRect(x1, y1, width, height);
      }
    });
    
    // Save the highlighted image
    const outputDir = ensureOutputDir();
    const outputFilename = `highlighted_${Date.now()}.png`;
    const outputPath = path.join(outputDir, outputFilename);
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
    
    return outputPath;
  } catch (error) {
    console.error("Error creating highlighted image:", error);
    return null;
  }
}

export { compareImages };