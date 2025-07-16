const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

router.get('/admin/images', isAdmin, async (req, res) => {
  try {
    const images = await db.get('images') || [];
    res.render('admin/images', {
      req,
      user: req.user,
      images
    });
  } catch (err) {
    log.error('Error loading images page:', err);
    res.status(500).render('error', { message: 'Error loading images.' });
  }
});

router.post('/admin/images/upload', isAdmin, async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.url || !data.title) {
      return res.status(400).send('Missing required image data.');
    }

    const newImage = {
      Id: uuidv4(),
      url: data.url,
      title: data.title,
      description: data.description || '',
      uploadedAt: new Date().toISOString()
    };

    const images = await db.get('images') || [];
    images.push(newImage);
    await db.set('images', images);

    logAudit(req.user.userId, req.user.username, 'image:upload', req.ip);
    res.status(200).send('Image uploaded successfully.');
  } catch (err) {
    log.error('Error uploading image:', err.stack || err);
    res.status(500).send('Error uploading image.');
  }
});

router.post('/admin/images/delete', isAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).send('Missing image ID.');
    }

    let images = await db.get('images') || [];
    const initialLength = images.length;
    images = images.filter(image => image.Id !== id);

    if (images.length === initialLength) {
      return res.status(404).send('Image not found.');
    }

    await db.set('images', images);

    logAudit(req.user.userId, req.user.username, 'image:delete', req.ip);
    res.status(200).send('Image deleted successfully.');
  } catch (err) {
    log.error('Error deleting image:', err.stack || err);
    res.status(500).send('Error deleting image.');
  }
});

module.exports = router;
