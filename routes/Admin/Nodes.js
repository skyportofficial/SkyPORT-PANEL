const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

async function checkNodeStatus(node) {
  try {
    const response = await axios({
      method: 'get',
      url: `http://${node.address}:${node.port}/`,
      auth: {
        username: 'Skyport',
        password: node.apiKey
      },
      headers: { 'Content-Type': 'application/json' }
    });

    const { versionFamily, versionRelease, online, remote, docker } = response.data;

    node.status = 'Online';
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;

    await db.set(`${node.id}_node`, node);
    return node;
  } catch {
    node.status = 'Offline';
    await db.set(`${node.id}_node`, node);
    return node;
  }
}

router.get('/admin/nodes', isAdmin, async (req, res) => {
  let nodes = await db.get('nodes') || [];
  let instances = await db.get('instances') || [];

  let set = {};
  for (const nodeId of nodes) {
    set[nodeId] = instances.filter(i => i.Node.id === nodeId).length;
  }

  const updatedNodes = await Promise.all(nodes.map(async id => {
    const node = await db.get(`${id}_node`);
    return await checkNodeStatus(node);
  }));

  res.render('admin/nodes', {
    req,
    user: req.user,
    nodes: updatedNodes,
    set
  });
});

router.get('/admin/node/:id/stats', isAdmin, async (req, res) => {
  const { id } = req.params;

  const node = await db.get(`${id}_node`);
  if (!node) return res.status(404).send('Node not found');

  const updatedNode = await checkNodeStatus(node);

  const instances = await db.get('instances') || [];
  const instanceCount = instances.filter(i => i.Node.id === id).length;

  let stats = {};
  let status = 'Offline';

  try {
    const response = await axios.get(`http://Skyport:${updatedNode.apiKey}@${updatedNode.address}:${updatedNode.port}/stats`);
    stats = response.data;

    if (stats && stats.uptime !== '0d 0h 0m') {
      status = 'Online';
    }
  } catch {}

  res.render('admin/nodestats', {
    req,
    user: req.user,
    stats,
    node: updatedNode,
    set: { [id]: instanceCount },
    status
  });
});

router.post('/nodes/create', isAdmin, async (req, res) => {
  const required = ['name', 'tags', 'ram', 'disk', 'processor', 'address', 'port'];
  for (const field of required) {
    if (!req.body[field]) return res.status(400).send('Form validation failure.');
  }

  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: null,
    configureKey: uuidv4(),
    status: 'Unconfigured'
  };

  await db.set(`${node.id}_node`, node);

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  logAudit(req.user.userId, req.user.username, 'node:create', req.ip);
  res.status(201).json({ ...node, configureKey: node.configureKey });
});

router.post('/nodes/delete', isAdmin, async (req, res) => {
  const { nodeId } = req.body;
  if (!nodeId) return res.status(400).json({ error: 'Missing nodeId' });

  const nodes = await db.get('nodes') || [];
  const nodeIndex = nodes.findIndex(id => id === nodeId);
  if (nodeIndex === -1) return res.status(404).json({ error: 'Node not found' });

  const node = await db.get(`${nodeId}_node`);
  let instances = await db.get('instances') || [];

  const instanceCount = instances.filter(i => i.Node.id === nodeId).length;

  if (instanceCount > 0) {
    if (req.query.deleteinstances !== 'true') {
      return res.status(400).json({ error: 'There are instances on the node' });
    }

    const delInstances = instances.filter(i => i.Node.id === nodeId);
    instances = instances.filter(i => i.Node.id !== nodeId);
    await db.set('instances', instances);

    for (const instance of delInstances) {
      await db.delete(`${instance.Id}_instance`);
      let userInstances = await db.get(`${instance.User}_instances`) || [];
      userInstances = userInstances.filter(inst => inst.Id !== instance.Id);
      await db.set(`${instance.User}_instances`, userInstances);
    }

    try {
      await axios.get(`http://Skyport:${node.apiKey}@${node.address}:${node.port}/instances/purge/all`);
    } catch (error) {
      log.error('Error calling purge API:', error);
    }
  }

  await db.delete(`${nodeId}_node`);
  nodes.splice(nodeIndex, 1);
  await db.set('nodes', nodes);

  logAudit(req.user.userId, req.user.username, 'node:delete', req.ip);
  res.status(200).json({ success: true });
});

router.post('/nodes/configure', async (req, res) => {
  const { configureKey, accessKey } = req.query;
  if (!configureKey || !accessKey) return res.status(400).json({ error: 'Missing configureKey or accessKey' });

  try {
    const nodes = await db.get('nodes') || [];
    let foundNode = null;
    for (const nodeId of nodes) {
      const node = await db.get(`${nodeId}_node`);
      if (node?.configureKey === configureKey) {
        foundNode = node;
        break;
      }
    }

    if (!foundNode) return res.status(404).json({ error: 'Node not found' });

    foundNode.apiKey = accessKey;
    foundNode.status = 'Configured';
    foundNode.configureKey = null;

    await db.set(`${foundNode.id}_node`, foundNode);
    res.status(200).json({ message: 'Node configured successfully' });
  } catch (error) {
    log.error('Error configuring node:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/admin/node/:id/configure-command', isAdmin, async (req, res) => {
  const { id } = req.params;
  const node = await db.get(`${id}_node`);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const configureKey = uuidv4();
  node.configureKey = configureKey;
  await db.set(`${id}_node`, node);

  const panelUrl = `${req.protocol}://${req.get('host')}`;
  const configureCommand = `npm run configure -- --panel ${panelUrl} --key ${configureKey}`;

  res.json({ nodeId: id, configureCommand });
});

router.get('/admin/node/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const node = await db.get(`${id}_node`);
  if (!node) return res.redirect('../nodes');

  res.render('admin/node', {
    req,
    user: req.user,
    node
  });
});

router.post('/admin/node/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const existingNode = await db.get(`${id}_node`);
  if (!existingNode) return res.status(400).send();

  const updatedNode = {
    ...existingNode,
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: req.body.apiKey,
    status: 'Unknown'
  };

  await db.set(`${id}_node`, updatedNode);
  const refreshed = await checkNodeStatus(updatedNode);
  res.status(201).send(refreshed);
});

router.post('/admin/nodes/radar/check', isAdmin, async (req, res) => {
  try {
    const nodes = await db.get('nodes') || [];
    const statuses = [];

    for (const nodeId of nodes) {
      const node = await db.get(`${nodeId}_node`);
      if (node) {
        const status = await checkNodeStatus(node);
        statuses.push({ id: nodeId, status: status.status });
      }
    }

    res.json({ success: true, statuses });
  } catch (error) {
    log.error('Radar check failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
