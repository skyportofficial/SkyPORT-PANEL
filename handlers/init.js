async function init() {
    const skyport = await db.get('skyport_instance');
    if (!skyport) {
        log.init('This is probably your first time starting Skyport, welcome!');
        log.init('You can find documentation for the panel at skyport.dev');

        const errorMessages = [];

        let imageCheck = await db.get('images');
        let userCheck = await db.get('users');

        if (!imageCheck) {
            errorMessages.push("Before starting Skyport for the first time, you didn't run the seed command!");
            errorMessages.push("Please run: npm run seed");
        }
        
        if (!userCheck) {
            errorMessages.push("If you didn't do it already, make a user for yourself: npm run createUser");
        }

        if (errorMessages.length > 0) {
            errorMessages.forEach(errorMsg => log.error(errorMsg));
            process.exit(1);  // Salir con error
        }

        const skyportId = uuidv4();
        const setupTime = Date.now();
        
        const info = { skyportId, setupTime, originalVersion: config.version };

        await db.set('skyport_instance', info);
        log.info('Initialized Skyport panel with ID: ' + skyportId);
    }
    log.info('Init complete!');
}
