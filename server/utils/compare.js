import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Ensure output directory exists
export const ensureOutputDir = () => {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
};

export async function getBase64Image(pathOrUrl) {
  try {
    let data;

    if (pathOrUrl.startsWith('http')) {
      // Fetch from a URL
      const response = await axios.get(pathOrUrl, { responseType: 'arraybuffer' });
      data = response.data;
    } else {
      // Read from local file system
      data = await fs.readFile(pathOrUrl);
    }

    return Buffer.from(data).toString('base64');
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
}
