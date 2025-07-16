const axios = require('axios');
const { db } = require('../handlers/db');
const log = new (require('cat-loggr'))();
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
// const config = require('../config.json'); // no usado

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisificar rl.question para usar async/await
function questionAsync(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function seed() {
  try {
    const existingImages = await db.get('images');
    if (existingImages && existingImages.length > 0) {
      const answer = await questionAsync('\'images\' is already set in the database. Do you want to continue seeding? (y/n) ');
      if (answer.toLowerCase() !== 'y') {
        log.info('Seeding aborted by the user.');
        rl.close();
        process.exit(0);
      }
    }
    await performSeeding();
    rl.close();
  } catch (error) {
    log.error(`Failed during seeding process: ${error}`);
    rl.close();
    process.exit(1);
  }
}

async function performSeeding() {
  try {
    const imagesIndexResponse = await axios.get('https://raw.githubusercontent.com/achul123/images_v2/refs/heads/main/seed/0.1.0-beta2.json');
    const imageUrls = imagesIndexResponse.data;
    let imageDataArray = [];

    for (let url of imageUrls) {
      log.info('Fetching image data...');
      try {
        const imageDataResponse = await axios.get(url);
        let imageData = imageDataResponse.data;
        imageData.Id = uuidv4();

        log.info('Seeding: ' + imageData.Name);
        imageDataArray.push(imageData);
      } catch (error) {
        log.error(`Failed to fetch image data from ${url}: ${error}`);
      }
    }

    if (imageDataArray.length > 0) {
      await db.set('images', imageDataArray);
      log.info('Seeding complete!');
    } else {
      log.info('No new images to seed.');
    }
  } catch (error) {
    log.error(`Failed to fetch image URLs or store image data: ${error}`);
  }
}

seed();

process.on('exit', () => {
  log.info('Exiting...');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
