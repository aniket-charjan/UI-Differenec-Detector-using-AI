


// Helper function to analyze image with Claude Vision API
async function analyzeScreenshot(imagePath, prompt) {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      const message = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Image
                }
              }
            ]
          }
        ]
      });
      
      return message.content;
    } catch (error) {
      console.error('Error analyzing image with Claude:', error);
      throw error;
    }
  }