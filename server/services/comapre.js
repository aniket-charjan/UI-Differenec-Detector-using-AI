import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import { createCanvas, loadImage } from 'canvas';
import path from 'path';
import { ensureOutputDir } from '../utils/compare.js';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


async function resizeForClaude(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const { width, height } = metadata;

  const maxSize = 1568;
  let newWidth = width;
  let newHeight = height;

  if (width > height && width > maxSize) {
    newWidth = maxSize;
    newHeight = Math.round((height / width) * maxSize);
  } else if (height > width && height > maxSize) {
    newHeight = maxSize;
    newWidth = Math.round((width / height) * maxSize);
  } else if (width === height && width > maxSize) {
    newWidth = newHeight = maxSize;
  }

  // Calculate scaling factors
  const scaleX = width / newWidth;
  const scaleY = height / newHeight;

  // Resize and save the new image
  const resizedPath = `${imagePath}_resized.png`;
  await sharp(imagePath).resize(newWidth, newHeight).toFile(resizedPath);
  console.log(`✅ Resized ${imagePath} → ${newWidth}x${newHeight}`);

  return { resizedPath, scaleX, scaleY };
}


// Compare two images and generate a report with highlighted differences
async function compareImages(image1Path, image2Path) {
  try {
    // Read and convert images to base64
    const image1Buffer = await fs.readFile(image1Path);
    const image2Buffer = await fs.readFile(image2Path);

    const base64Image1 = image1Buffer.toString("base64");
    const base64Image2 = image2Buffer.toString("base64");

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
              text: `Compare these two website screenshots and provide a detailed analysis of all UI differences. Also, return the processed image dimensions before analysis.

          First, return this JSON:
          \`\`\`json
          {
            "processed_dimensions": {
              "image1": { "width": W1, "height": H1 },
              "image2": { "width": W2, "height": H2 }
            }
          }
          \`\`\`

          Then, return the difference analysis in this format:

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
          `,
            },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64Image1 }
            },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64Image2 }
            }
          ]
        }
      ]
    });

    // Extract text response
    const content = response.content[0].text;

    // Extract `processed_dimensions`
    const dimensionsMatch = content.match(/```json\n{\s*"processed_dimensions"[\s\S]*?}\n```/);
    let processedDimensions = null;
    if (dimensionsMatch) {
      processedDimensions = JSON.parse(dimensionsMatch[0].replace(/```json\n|\n```/g, ""));
    }

    // Extract `differences`
    const differencesMatch = content.match(/```json\n{\s*"differences"[\s\S]*?}\n```/);
    let differences = null;
    if (differencesMatch) {
      differences = JSON.parse(differencesMatch[0].replace(/```json\n|\n```/g, ""));
    }

    if (!processedDimensions || !differences) {
      throw new Error("Failed to extract processed dimensions or differences from response");
    }

    console.log("✅ Processed Dimensions:", processedDimensions);
    console.log("✅ Differences:", differences.differences);

    // Generate highlighted image using the processed dimensions
    const outputPath = await createHighlightedImage(image2Path, differences, processedDimensions.processed_dimensions.image2);

    return {
      processedDimensions,
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
async function createHighlightedImage(imagePath, differences, processedDims) {
  if (!differences || !differences.differences) {
    console.error("No differences data to highlight");
    return null;
  }

  try {
    // Load the resized image that Claude used
    const image = await loadImage(imagePath);

    // Ensure canvas matches the resized image dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw the original resized image
    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Scale factors for correct bounding box alignment
    const scaleX = image.width / processedDims.width;
    const scaleY = image.height / processedDims.height;

    // Set highlight styles
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.lineWidth = 3;
    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";

    // Highlight each difference
    differences.differences.forEach((diff, index) => {
      if (diff.highlight_area) {
        const { x1, y1, x2, y2 } = diff.highlight_area;

        // Scale bounding box to match the actual resized image dimensions
        const scaledX1 = x1 * scaleX;
        const scaledY1 = y1 * scaleY;
        const scaledX2 = x2 * scaleX;
        const scaledY2 = y2 * scaleY;
        const width = scaledX2 - scaledX1;
        const height = scaledY2 - scaledY1;

        console.log(`🔸 Highlighting Difference ${index + 1}:`, diff.description);
        console.log(`   Original: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}`);
        console.log(`   Scaled: x1=${scaledX1}, y1=${scaledY1}, x2=${scaledX2}, y2=${scaledY2}`);

        // Draw rectangle
        ctx.strokeRect(scaledX1, scaledY1, width, height);
        ctx.fillRect(scaledX1, scaledY1, width, height);
      }
    });

    // Save the highlighted image
    const outputDir = ensureOutputDir();
    const outputFilename = `highlighted_${Date.now()}.png`;
    const outputPath = path.join(outputDir, outputFilename);

    const buffer = canvas.toBuffer("image/png");
    await fs.writeFile(outputPath, buffer);

    console.log("✅ Highlighted image saved at:", outputPath);
    return outputPath;
  } catch (error) {
    console.error("❌ Error creating highlighted image:", error);
    return null;
  }
}


export { compareImages };