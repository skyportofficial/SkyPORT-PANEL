const config = require('../config.json');
const Keyv = require('keyv');

if (!config.databaseURL) {
    throw new Error('Database URL not set in config.json');
}

let db;

if (config.databaseURL.startsWith('sqlite')) {
    db = new Keyv(config.databaseURL); // por ejemplo: 'sqlite://skyport.db'
} else {
    const KeyvMysql = require('keyv-mysql');

    db = new Keyv({
        store: new KeyvMysql(config.databaseURL, {
            table: 'skyport',
            // keySize no es estándar, quitar si da error
        })
    });
}

module.exports = { db };
