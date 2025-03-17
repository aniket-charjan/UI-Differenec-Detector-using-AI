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
              text: `Compare these two website screenshots and provide a detailed analysis of all UI differences. Focus on:

    1. Text changes (different wording, punctuation, etc.)
    2. Button text or appearance changes
    3. Layout differences (element position shifts, resizing, alignment changes)
    4. Element additions or removals (new buttons, missing images, deleted sections)
    5. Color or style changes (background, font, borders, shadows)

    For each difference found, provide a JSON summary with **precise coordinates** for the affected area, ensuring that the bounding box fully encloses the change and is large enough to be clearly highlighted. The format should be:

    \`\`\`json
    {
      "differences": [
        {
          "type": "text_change", 
          "location": "header",
          "description": "Question mark changed to exclamation mark",
          "coordinates": {
            "x1": 123, "y1": 456, "x2": 789, "y2": 101
          },
          "highlight_area": {
            "x1": 113, "y1": 446, "x2": 799, "y2": 111
          },
          "before": "text before",
          "after": "text after"
        }
      ]
    }
    \`\`\`

    - **coordinates**: Exact bounding box for the changed element.
    - **highlight_area**: Slightly expanded bounding box (~10px margin) for clear visual emphasis.
    - Ensure all coordinates are in absolute pixel values based on the original image resolution.
    - If multiple elements are affected, provide multiple bounding boxes.
    - If no significant differences are found, return:
    \`\`\`json
    { "differences": [] }
    \`\`\`
    `
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
    console.log(differences.differences[0]);
    
    // Generate highlighted image
    const outputPath = await createHighlightedImage(image1Path, differences);
    
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
    
    // Ensure the canvas matches the image dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    // Draw the original image
    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Set highlight styles
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';  // Red border
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';    // Semi-transparent red fill

    // Highlight each difference
    differences.differences.forEach((diff, index) => {
      if (diff.highlight_area) {
        const { x1, y1, x2, y2 } = diff.highlight_area;
        const width = x2 - x1;
        const height = y2 - y1;

        console.log(`Difference ${index + 1}:`, diff.description);
        console.log(`Coordinates: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}`);

        // Debugging: Draw a small circle at each corner to verify alignment
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(x1, y1, 5, 0, 2 * Math.PI); // Top-left
        ctx.arc(x2, y2, 5, 0, 2 * Math.PI); // Bottom-right
        ctx.fill();

        // Restore the original fill color
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';

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

    console.log("✅ Highlighted image saved at:", outputPath);
    return outputPath;
  } catch (error) {
    console.error("❌ Error creating highlighted image:", error);
    return null;
  }
}

export { compareImages };