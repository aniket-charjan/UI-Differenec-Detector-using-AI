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

/**
 * Compare two images and generate a report with highlighted differences
 * @param {string} image1Path - Path to the first image
 * @param {string} image2Path - Path to the second image
 * @returns {Object} Analysis result with differences and highlighted image path
 */
async function compareImages(image1Path, image2Path) {
  try {
    // Validate input paths
    await Promise.all([
      fs.access(image1Path).catch(() => { throw new Error(`Cannot access image: ${image1Path}`) }),
      fs.access(image2Path).catch(() => { throw new Error(`Cannot access image: ${image2Path}`) })
    ]);

    // Read and convert images to base64
    const [image1Buffer, image2Buffer] = await Promise.all([
      fs.readFile(image1Path),
      fs.readFile(image2Path)
    ]);

    const base64Image1 = image1Buffer.toString("base64");
    const base64Image2 = image2Buffer.toString("base64");

    console.log(`✅ Processing images: ${path.basename(image1Path)} & ${path.basename(image2Path)}`);

    // Ask Claude to analyze the differences
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4096,
      temperature: 0.2, // Lower temperature for more consistent results
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
            
            For each difference found, provide a JSON summary with **precise coordinates** for the affected area, ensuring that the bounding box fully encloses the change and is large enough to be clearly highlighted.
            
            Additionally, **before analyzing the images**, first return the dimensions you have processed for each image in this format:
            
            \`\`\`json
            {
              "processed_dimensions": {
                "image1": { "width": W1, "height": H1 },
                "image2": { "width": W2, "height": H2 }
              }
            }
            \`\`\`
            
            Then, proceed with the difference analysis using these dimensions as the reference.
            
            The format for differences should be:
            
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
            
            - **processed_dimensions**: The actual width and height Claude used for each image.
            - **coordinates**: Exact bounding box for the changed element with ~5 px clearance for each UI element on all sides.
            - **highlight_area**: Slightly expanded bounding box (~10px margin) for clear visual emphasis.
            - Ensure all coordinates are in absolute pixel values based on the processed image dimensions.
            - If multiple elements are affected, provide multiple bounding boxes.
            - If no significant differences are found, return:
            \`\`\`json
            { "differences": [] }
            \`\`\`
            `
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

    // Extract JSON data using more robust pattern matching
    const extractJsonObject = (jsonString, objectName) => {
      try {
        // Find JSON block for the specified object
        const regex = new RegExp(`\`\`\`json\\n({\\s*"${objectName}"[\\s\\S]*?})\\n\`\`\``, 'i');
        const match = jsonString.match(regex);
        
        if (!match || !match[1]) {
          throw new Error(`Could not find ${objectName} JSON block in the response`);
        }
        
        return JSON.parse(match[1]);
      } catch (error) {
        console.error(`Error extracting ${objectName}:`, error.message);
        console.error('Raw content:', jsonString);
        throw error;
      }
    };

    // Extract JSON data
    const processedDimensions = extractJsonObject(content, "processed_dimensions");
    const differences = extractJsonObject(content, "differences");

    console.log("✅ Processed Dimensions:", processedDimensions);
    console.log(`✅ Found ${differences.differences.length} differences`);

    // Generate highlighted image
    const outputPath = await createHighlightedImage(image2Path, differences, processedDimensions.processed_dimensions.image2);

    // Return complete analysis
    return {
      processedDimensions,
      differences,
      analysis: content,
      highlightedImagePath: outputPath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Error comparing images:", error);
    throw error;
  }
}

/**
 * Create an image with highlighted differences
 * @param {string} imagePath - Path to the original image
 * @param {Object} differences - Differences object from Claude
 * @param {Object} processedDims - Processed dimensions from Claude
 * @returns {string} Path to the highlighted image
 */
async function createHighlightedImage(imagePath, differences, processedDims) {
  if (!differences || !differences.differences || differences.differences.length === 0) {
    console.log("ℹ️ No differences detected to highlight");
    return null;
  }

  try {
    // Load the image
    const image = await loadImage(imagePath);

    // Create canvas with original image dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw the original image
    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Calculate scale factors for coordinate mapping
    const scaleX = image.width / processedDims.width;
    const scaleY = image.height / processedDims.height;

    // Add a legend
    const legendHeight = 40;
    const legendSpacing = 20;
    const expandedCanvas = createCanvas(image.width, image.height + legendHeight);
    const expandedCtx = expandedCanvas.getContext("2d");
    
    // Draw original image on expanded canvas
    expandedCtx.drawImage(canvas, 0, 0);
    
    // Draw legend background
    expandedCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
    expandedCtx.fillRect(0, image.height, image.width, legendHeight);
    
    // Draw legend text
    expandedCtx.fillStyle = "black";
    expandedCtx.font = "14px Arial";
    expandedCtx.fillText(`${differences.differences.length} UI differences detected`, legendSpacing, image.height + 25);

    // Create color variations for different types of changes
    const colorSchemes = {
      "text_change": { stroke: "rgba(255, 0, 0, 0.8)", fill: "rgba(255, 0, 0, 0.3)" },
      "layout_change": { stroke: "rgba(0, 0, 255, 0.8)", fill: "rgba(0, 0, 255, 0.3)" },
      "element_added": { stroke: "rgba(0, 128, 0, 0.8)", fill: "rgba(0, 128, 0, 0.3)" },
      "element_removed": { stroke: "rgba(255, 165, 0, 0.8)", fill: "rgba(255, 165, 0, 0.3)" },
      "style_change": { stroke: "rgba(128, 0, 128, 0.8)", fill: "rgba(128, 0, 128, 0.3)" },
      "default": { stroke: "rgba(255, 0, 0, 0.8)", fill: "rgba(255, 0, 0, 0.3)" }
    };

    // Add number labels for differences
    expandedCtx.font = "bold 12px Arial";
    expandedCtx.lineWidth = 3;

    // Highlight each difference
    differences.differences.forEach((diff, index) => {
      if (diff.highlight_area) {
        const { x1, y1, x2, y2 } = diff.highlight_area;

        // Scale bounding box to match the actual image dimensions
        const scaledX1 = Math.max(0, x1 * scaleX);
        const scaledY1 = Math.max(0, y1 * scaleY);
        const scaledX2 = Math.min(image.width, x2 * scaleX);
        const scaledY2 = Math.min(image.height, y2 * scaleY);
        const width = scaledX2 - scaledX1;
        const height = scaledY2 - scaledY1;

        // Select color scheme based on difference type
        const colorScheme = colorSchemes[diff.type] || colorSchemes.default;
        expandedCtx.strokeStyle = colorScheme.stroke;
        expandedCtx.fillStyle = colorScheme.fill;

        // Draw rectangle
        expandedCtx.strokeRect(scaledX1, scaledY1, width, height);
        expandedCtx.fillRect(scaledX1, scaledY1, width, height);

        // Add number label
        expandedCtx.fillStyle = "white";
        expandedCtx.strokeStyle = "black";
        expandedCtx.strokeText(`${index + 1}`, scaledX1 + 5, scaledY1 + 15);
        expandedCtx.fillText(`${index + 1}`, scaledX1 + 5, scaledY1 + 15);

        console.log(`🔸 Difference #${index + 1} (${diff.type}): ${diff.description}`);
      }
    });

    // Save the highlighted image with timestamps to prevent overwriting
    const outputDir = ensureOutputDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = path.basename(imagePath, path.extname(imagePath));
    const outputFilename = `diff_${baseFilename}_${timestamp}.png`;
    const outputPath = path.join(outputDir, outputFilename);

    const buffer = expandedCanvas.toBuffer("image/png");
    await fs.writeFile(outputPath, buffer);

    console.log("✅ Highlighted image saved at:", outputPath);
    return outputPath;
  } catch (error) {
    console.error("❌ Error creating highlighted image:", error);
    return null;
  }
}

// Export functions for use in other modules
export { compareImages };