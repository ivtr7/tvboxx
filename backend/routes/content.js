import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/database.js';
import { broadcastToDevice } from '../websocket/index.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and PDFs
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|html/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Content will be stored in MySQL database

// Public content endpoint (no authentication required)
router.get('/public/content', async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID é obrigatório' });
    }

    // Get device info
    const [devices] = await db.execute(
      'SELECT device_id FROM devices WHERE device_id = ?',
      [deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    // Get active content
    const [content] = await db.execute(`
      SELECT 
        id,
        title,
        type,
        file_path,
        url,
        duration
      FROM content
      WHERE active = true
      ORDER BY created_at DESC
    `);

    // Format content for public consumption
    const formattedContent = content.map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      url: item.file_path ? `/uploads/${path.basename(item.file_path)}` : item.url,
      duration: item.duration
    }));

    res.json({
      success: true,
      data: formattedContent,
      device_id: deviceId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Public content error:', error);
    res.status(500).json({ error: 'Erro ao buscar conteúdo público' });
  }
});

// Apply authentication middleware to protected routes


// Get all content
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM content WHERE active = true ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content by device
router.get('/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Verify device exists
    const [devices] = await db.execute(
      'SELECT id FROM devices WHERE id = ?',
      [deviceId]
    );
    
    if (devices.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }
    
    // Get device content with order
    const [content] = await db.execute(`
      SELECT 
        c.id,
        c.title as nome,
        c.type,
        c.file_path,
        c.url,
        c.duration,
        dc.ordem,
        c.created_at
      FROM content c
      LEFT JOIN device_content dc ON c.id = dc.content_id AND dc.device_id = ?
      WHERE c.active = true AND (dc.device_id = ? OR dc.device_id IS NULL)
      ORDER BY dc.ordem ASC, c.created_at DESC
    `, [deviceId, deviceId]);
    
    res.json(content);
  } catch (error) {
    console.error('Get device content error:', error);
    res.status(500).json({ error: 'Erro ao buscar conteúdo do dispositivo' });
  }
});

// Create content
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, description, duration, url } = req.body;
    const file = req.file;

    // Determine content type based on file or URL
    let contentType = 'text';
    let filePath = null;
    let contentUrl = url || null;

    if (file) {
      filePath = file.path;
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.mp4', '.avi', '.mov', '.wmv'].includes(ext)) {
        contentType = 'video';
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
        contentType = 'image';
      }
    } else if (url) {
      contentType = 'url';
    }

    // Insert into database
    const tenantId = req.user?.tenant_id || 1;
    const [result] = await db.execute(
      'INSERT INTO content (title, type, file_path, url, duration, active, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        title || 'Novo Conteúdo',
        contentType,
        filePath,
        contentUrl,
        parseInt(duration) || 10,
        true,
        tenantId
      ]
    );

    // Get the created content
    const [rows] = await db.execute(
      'SELECT * FROM content WHERE id = ?',
      [result.insertId]
    );

    const newContent = rows[0];

    // Notify all devices about content update
    broadcastToDevice('all', {
      type: 'CONTENT_UPDATED',
      action: 'created',
      content: newContent
    });

    res.status(201).json(newContent);
  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id || 1;
    const [rows] = await db.execute(
      'SELECT * FROM content WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get content by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update content
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, url, duration, active } = req.body;
    
    // Check if content exists
    const tenantId = req.user?.tenant_id || 1;
    const [existingRows] = await db.execute(
      'SELECT * FROM content WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Update content
    await db.execute(
      'UPDATE content SET title = ?, type = ?, url = ?, duration = ?, active = ? WHERE id = ? AND tenant_id = ?',
      [
        title || existingRows[0].title,
        type || existingRows[0].type,
        url || existingRows[0].url,
        duration !== undefined ? parseInt(duration) : existingRows[0].duration,
        active !== undefined ? active : existingRows[0].active,
        id,
        tenantId
      ]
    );

    // Get updated content
    const [updatedRows] = await db.execute(
      'SELECT * FROM content WHERE id = ?',
      [id]
    );

    const updatedContent = updatedRows[0];

    // Notify all devices about content update
    broadcastToDevice('all', {
      type: 'CONTENT_UPDATED',
      action: 'updated',
      content: updatedContent
    });

    res.json(updatedContent);
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete content
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if content exists
    const tenantId = req.user?.tenant_id || 1;
    const [existingRows] = await db.execute(
      'SELECT * FROM content WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Delete from database
    await db.execute(
      'DELETE FROM content WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    // Notify all devices about content deletion
    broadcastToDevice('all', {
      type: 'CONTENT_UPDATED',
      action: 'deleted',
      contentId: id
    });
    
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content stats
router.get('/stats/summary', async (req, res) => {
  try {
    // Get total count
    const tenantId = req.user?.tenant_id || 1;
    const [totalRows] = await db.execute('SELECT COUNT(*) as total FROM content WHERE tenant_id = ?', [tenantId]);
    const total = totalRows[0].total;

    // Get active/inactive counts
    const [activeRows] = await db.execute('SELECT COUNT(*) as active FROM content WHERE active = true AND tenant_id = ?', [tenantId]);
    const active = activeRows[0].active;
    const inactive = total - active;

    // Get counts by type
    const [typeRows] = await db.execute(
      'SELECT type, COUNT(*) as count FROM content WHERE tenant_id = ? GROUP BY type',
      [tenantId]
    );
    
    const by_type = {
      video: 0,
      image: 0,
      text: 0,
      url: 0
    };
    
    typeRows.forEach(row => {
      by_type[row.type] = row.count;
    });

    const stats = {
      total,
      active,
      inactive,
      by_type
    };

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;