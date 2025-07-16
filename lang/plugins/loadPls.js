const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

const pluginsJsonPath = path.join(__dirname, 'plugins', 'plugins.json');

function readPluginsJson() {
    try {
        const pluginsJson = fs.readFileSync(pluginsJsonPath, 'utf8');
        return JSON.parse(pluginsJson);
    } catch (error) {
        console.error('Error reading plugins.json:', error);
        return {};
    }
}

function loadPlugins(pluginDir) {
    const plugins = {};
    const pluginFolders = fs.readdirSync(pluginDir);
    const pluginsJson = readPluginsJson();

    pluginFolders.forEach(folder => {
        const folderPath = path.join(pluginDir, folder);

        if (!fs.statSync(folderPath).isDirectory()) return;

        const configPath = path.join(folderPath, 'manifest.json');
        if (!fs.existsSync(configPath)) {
            console.warn(`Manifest file does not exist for plugin ${folder}.`);
            return;
        }

        try {
            const configRaw = fs.readFileSync(configPath, 'utf8');
            const pluginConfig = JSON.parse(configRaw);

            if (!pluginConfig.name) {
                console.warn(`Plugin in folder ${folder} has no "name" in manifest.json.`);
                return;
            }

            if (!pluginsJson[pluginConfig.name]) {
                console.warn(`Plugin ${pluginConfig.name} not found in plugins.json.`);
                return;
            }

            if (!pluginsJson[pluginConfig.name].enabled) {
                return;
            }

            plugins[folder] = {
                config: pluginConfig,
            };
        } catch (err) {
            console.error(`Failed to load manifest for ${folder}:`, err.message);
        }
    });

    return plugins;
}

module.exports = router;
module.exports.loadPlugins = loadPlugins;
