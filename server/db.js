import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: 10, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout if connection takes too long
});

// Initialize database with required tables and extensions
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_path TEXT NOT NULL, -- Path to the uploaded image
        base64_data TEXT, -- Base64 string (optional if storing files)
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comparisons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        image1_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        image2_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        analysis TEXT,  -- Full text response from AI
        highlighted_image_path TEXT, -- Path to the highlighted image
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS differences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          comparison_id UUID NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
          type TEXT NOT NULL, -- e.g., 'text_change', 'layout_change'
          location TEXT, -- e.g., 'header', 'footer'
          description TEXT, -- Description of the change
          coordinates JSONB, -- { "x1": 123, "y1": 456, "x2": 789, "y2": 101 }
          before_text TEXT, -- Optional: text before the change
          after_text TEXT, -- Optional: text after the change
          created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_comparison_created_at ON comparisons(created_at);
      CREATE INDEX IF NOT EXISTS idx_diff_comparison_id ON differences(comparison_id);
      CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
      CREATE INDEX IF NOT EXISTS idx_comparison_images ON comparisons(image1_id, image2_id);
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  } finally {
    client.release();
  }
}

export {
  pool,
  initDatabase,
};
