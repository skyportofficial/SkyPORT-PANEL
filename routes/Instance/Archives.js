const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/archives", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('/instances');

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance || !instance.ContainerId) return res.redirect('/instances');

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) return res.status(403).send('Unauthorized access to this instance.');

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
        }

        if (instance.Node?.address && instance.Node?.port) {
            const RequestData = {
                method: 'get',
                url: `http://${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives`,
                auth: {
                    username: 'Skyport',
                    password: instance.Node.apiKey
                },
                headers: { 'Content-Type': 'application/json' }
            };

            try {
                const response = await axios(RequestData);
                const archives = response.data.archives || [];
                const allPluginData = Object.values(plugins).map(p => p.config);
                const settings = await db.get('settings');

                res.render('instance/archives', {
                    req,
                    user: req.user,
                    archives,
                    settings,
                    addons: {
                        plugins: allPluginData
                    }
                });
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'Connection to node failed.';
                console.error('Error fetching archives from node:', errorMessage);
                res.status(500).send({ message: errorMessage });
            }
        } else {
            res.status(500).send('Invalid instance node configuration');
        }
    } catch (err) {
        console.error('Error fetching instance or settings:', err);
        res.status(500).send('Server error');
    }
});

router.post('/instance/:id/archives/create', async (req, res) => {
    if (!req.user) return res.redirect('/');
    const { id } = req.params;

    try {
        const instance = await db.get(`${id}_instance`);
        if (!id || !instance || !instance.ContainerId) return res.redirect('/instances');

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) return res.status(403).send('Unauthorized access to this instance.');

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
        }

        const RequestData = {
            method: 'post',
            url: `http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives/${instance.VolumeId}/create`,
            headers: { 'Content-Type': 'application/json' }
        };

        const response = await axios(RequestData);
        if (response.status === 200) {
            res.redirect(`/instance/${id}/archives`);
        } else {
            res.status(500).send('Failed to create archive');
        }
    } catch (err) {
        console.error('Error creating archive:', err);
        res.status(500).send('Server error during archive creation');
    }
});

router.post('/instance/:id/archives/delete/:archivename', async (req, res) => {
    if (!req.user) return res.redirect('/');
    const { id, archivename } = req.params;

    try {
        const instance = await db.get(`${id}_instance`);
        if (!id || !instance || !instance.ContainerId) return res.redirect('/instances');

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) return res.status(403).send('Unauthorized access to this instance.');

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
        }

        const RequestData = {
            method: 'post',
            url: `http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives/delete/${archivename}`,
            headers: { 'Content-Type': 'application/json' }
        };

        const response = await axios(RequestData);
        if (response.status === 200) {
            res.redirect(`/instance/${id}/archives`);
        } else {
            res.status(500).send('Failed to delete archive');
        }
    } catch (err) {
        console.error('Error deleting archive:', err);
        res.status(500).send('Server error during archive deletion');
    }
});

router.post('/instance/:id/archives/rollback/:archivename', async (req, res) => {
    if (!req.user) return res.redirect('/');
    const { id, archivename } = req.params;

    try {
        const instance = await db.get(`${id}_instance`);
        if (!id || !instance || !instance.ContainerId) return res.redirect('/instances');

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) return res.status(403).send('Unauthorized access to this instance.');

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
        }

        const RequestData = {
            method: 'post',
            url: `http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives/rollback/${instance.VolumeId}/${archivename}`,
            headers: { 'Content-Type': 'application/json' }
        };

        const response = await axios(RequestData);
        if (response.status === 200) {
            res.redirect(`/instance/${id}/archives`);
        } else {
            res.status(500).send('Failed to rollback archive');
        }
    } catch (err) {
        console.error('Error rolling back archive:', err);
        res.status(500).send('Server error during archive rollback');
    }
});

module.exports = router;
