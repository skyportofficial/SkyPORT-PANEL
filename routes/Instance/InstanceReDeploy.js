const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

const router = express.Router();

router.get('/instances/redeploy/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.redirect('/admin/instances');
    }

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.redirect('/admin/instances');
        }

        const nodeId = instance.Node?.id;
        if (!nodeId) {
            return res.status(400).json({ error: 'Instance node ID is missing.' });
        }

        const { image, memory, cpu, ports, name, user, primary } = req.query;

        if (!image) return res.status(400).json({ error: 'Missing image parameter' });
        if (!memory) return res.status(400).json({ error: 'Missing memory parameter' });
        if (!cpu) return res.status(400).json({ error: 'Missing cpu parameter' });
        if (!ports) return res.status(400).json({ error: 'Missing ports parameter' });
        if (!name) return res.status(400).json({ error: 'Missing name parameter' });
        if (!user) return res.status(400).json({ error: 'Missing user parameter' });
        if (!primary) return res.status(400).json({ error: 'Missing primary parameter' });

        // Validar formato de image
        const match = image.match(/\(([^)]+)\)/);
        if (!match) {
            return res.status(400).json({ error: 'Invalid image format' });
        }
        const shortimage = match[1];

        const node = await db.get(`${nodeId}_node`);
        if (!node) {
            return res.status(400).json({ error: 'Invalid node' });
        }

        // Obtener imágenes solo una vez y pasar como parámetro
        const rawImages = await db.get('images');

        const requestData = await prepareRequestData(shortimage, memory, cpu, ports, name, node, id, instance.ContainerId, instance.Env, rawImages);
        const response = await axios(requestData);

        await updateDatabaseWithNewInstance(response.data, user, node, shortimage, memory, cpu, ports, primary, name, id, instance.Env, instance.imageData, rawImages);

        logAudit(req.user.userId, req.user.username, 'instance:redeploy', req.ip);
        res.status(201).json({
            message: 'Container redeployed successfully and updated in user\'s servers',
            containerId: response.data.containerId,
            volumeId: response.data.volumeId
        });
    } catch (error) {
        log.error('Error redeploying instance:', error);
        res.status(500).json({
            error: 'Failed to redeploy container',
            details: error.response?.data || error.message || 'No additional error info'
        });
    }
});

async function prepareRequestData(image, memory, cpu, ports, name, node, id, containerId, Env, rawImages) {
    const imageData = rawImages.find(i => i.Image === image);

    const requestData = {
        method: 'post',
        url: `http://${node.address}:${node.port}/instances/redeploy/${containerId}`,
        auth: {
            username: 'Skyport',
            password: node.apiKey
        },
        headers: { 
            'Content-Type': 'application/json'
        },
        data: {
            Name: name,
            Id: id,
            Image: image,
            Env,
            Scripts: imageData?.Scripts,
            Memory: memory ? parseInt(memory) : undefined,
            Cpu: cpu ? parseInt(cpu) : undefined,
            ExposedPorts: {},
            PortBindings: {},
            AltImages: imageData?.AltImages || []
        }
    };

    ports.split(',').forEach(portMapping => {
        const [containerPort, hostPort] = portMapping.split(':');
        const key = `${containerPort}/tcp`;
        requestData.data.ExposedPorts[key] = {};
        requestData.data.PortBindings[key] = [{ HostPort: hostPort }];
    });

    return requestData;
}

async function updateDatabaseWithNewInstance(responseData, userId, node, image, memory, cpu, ports, primary, name, id, Env, imagedata, rawImages) {
    const imageData = rawImages.find(i => i.Image === image);
    const altImages = imageData?.AltImages || [];

    const instanceData = {
        Name: name,
        Id: id,
        Node: node,
        User: userId,
        ContainerId: responseData.containerId,
        VolumeId: id,
        Memory: parseInt(memory),
        Cpu: parseInt(cpu),
        Ports: ports,
        Primary: primary,
        Env,
        Image: image,
        AltImages: altImages,
        imageData: imagedata,
        InternalState: 'READY'
    };

    let userInstances = await db.get(`${userId}_instances`) || [];
    userInstances = userInstances.filter(inst => inst.Id !== id);
    userInstances.push(instanceData);
    await db.set(`${userId}_instances`, userInstances);

    let globalInstances = await db.get('instances') || [];
    globalInstances = globalInstances.filter(inst => inst.Id !== id);
    globalInstances.push(instanceData);
    await db.set('instances', globalInstances);

    await db.set(`${id}_instance`, instanceData);
}

module.exports = router;
