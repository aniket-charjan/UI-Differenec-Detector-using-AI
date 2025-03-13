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
      CREATE TABLE IF NOT EXISTS comparisons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        baseline_image_path VARCHAR(255),
        comparison_image_path VARCHAR(255),
        diff_image_path VARCHAR(255),
        report_data JSONB
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ui_elements (
        id SERIAL PRIMARY KEY,
        comparison_id INTEGER REFERENCES comparisons(id) ON DELETE CASCADE,
        screenshot_type VARCHAR(50), -- 'baseline' or 'comparison'
        element_type VARCHAR(100),
        position JSONB, -- {x, y, width, height}
        attributes JSONB, -- color, text, etc.
        changed BOOLEAN
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS differences (
        id SERIAL PRIMARY KEY,
        comparison_id INTEGER REFERENCES comparisons(id) ON DELETE CASCADE,
        element_id INTEGER REFERENCES ui_elements(id),
        change_type VARCHAR(50), -- 'added', 'removed', 'modified'
        details JSONB -- Changed properties and values
      )
    `);
    
    // Create indexes for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_comparison_id ON ui_elements(comparison_id);
      CREATE INDEX IF NOT EXISTS idx_diff_comparison_id ON differences(comparison_id);
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  } finally {
    client.release();
  }
}

// Insert a new comparison
async function insertComparison(name, baselineImagePath, comparisonImagePath) {
  const result = await pool.query(
    'INSERT INTO comparisons (name, baseline_image_path, comparison_image_path) VALUES ($1, $2, $3) RETURNING id',
    [name, baselineImagePath, comparisonImagePath]
  );
  return result.rows[0].id;
}

// Update comparison with diff image and report
async function updateComparisonWithResults(comparisonId, diffImagePath, reportData) {
  await pool.query(
    'UPDATE comparisons SET diff_image_path = $1, report_data = $2 WHERE id = $3',
    [diffImagePath, JSON.stringify(reportData), comparisonId]
  );
}

// Store UI elements in the database
async function storeUIElements(comparisonId, screenshotType, elements) {
  const elementIds = [];
  
  for (const element of elements) {
    const result = await pool.query(
      `INSERT INTO ui_elements 
       (comparison_id, screenshot_type, element_type, position, attributes, changed) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        comparisonId, 
        screenshotType, 
        element.elementType, 
        JSON.stringify(element.position),
        JSON.stringify({
          textContent: element.textContent,
          color: element.color,
          ...element.otherAttributes
        }),
        false
      ]
    );
    elementIds.push(result.rows[0].id);
  }
  
  return elementIds;
}

// Store differences in the database
async function storeDifferences(comparisonId, differences) {
  for (const diff of differences) {
    await pool.query(
      `INSERT INTO differences 
       (comparison_id, change_type, details) 
       VALUES ($1, $2, $3)`,
      [
        comparisonId,
        diff.changeType,
        JSON.stringify(diff)
      ]
    );
  }
}

// Get a comparison by ID
async function getComparisonById(comparisonId) {
  const comparisonResult = await pool.query(
    'SELECT * FROM comparisons WHERE id = $1',
    [comparisonId]
  );
  
  if (comparisonResult.rows.length === 0) {
    return null;
  }
  
  const comparison = comparisonResult.rows[0];
  
  // Get UI elements
  const elementsResult = await pool.query(
    'SELECT * FROM ui_elements WHERE comparison_id = $1',
    [comparisonId]
  );
  
  // Get differences
  const differencesResult = await pool.query(
    'SELECT * FROM differences WHERE comparison_id = $1',
    [comparisonId]
  );
  
  return {
    comparison,
    elements: elementsResult.rows,
    differences: differencesResult.rows
  };
}

// Get all comparisons
async function getAllComparisons() {
  const result = await pool.query(
    'SELECT id, name, created_at FROM comparisons ORDER BY created_at DESC'
  );
  return result.rows;
}

export {
  pool,
  initDatabase,
  insertComparison,
  updateComparisonWithResults,
  storeUIElements,
  storeDifferences,
  getComparisonById,
  getAllComparisons
};
