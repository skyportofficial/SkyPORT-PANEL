const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const config = require('../../config.json');
const { isAdmin } = require('../../utils/isAdmin.js');

router.get('/admin/overview', isAdmin, async (req, res) => {
  try {
    const [users = [], nodes = [], images = [], instances = []] = await Promise.all([
      db.get('users'),
      db.get('nodes'),
      db.get('images'),
      db.get('instances')
    ]);

    res.render('admin/overview', {
      req,
      user: req.user,
      usersTotal: users.length,
      nodesTotal: nodes.length,
      imagesTotal: images.length,
      instancesTotal: instances.length,
      version: config.version
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to retrieve data from the database.' });
  }
});

module.exports = router;
