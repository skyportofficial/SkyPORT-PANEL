#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

program
  .version("0.1.0-beta6")
  .description("Command Line Interface for the Skyport Panel");

// Promisificar rl.question para evitar callbacks
function questionAsync(rl, query) {
  return new Promise(resolve => rl.question(query, resolve));
}

program
  .command('seed')
  .description('Seeds the images to the database')
  .action(async () => {
    const axios = require('axios');
    const { db } = require('../../handlers/db');
    const log = new (require('cat-loggr'))();
    const readline = require('readline');
    const { v4: uuidv4 } = require('uuid');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    async function performSeeding() {
      try {
        const imagesIndexResponse = await axios.get('https://raw.githubusercontent.com/skyportlabs/images_v2/main/seed/0.1.0-beta2.json');
        const imageUrls = imagesIndexResponse.data;
        let imageDataArray = [];

        for (let url of imageUrls) {
          log.info('Fetching image data... ' + url);
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

    try {
      const existingImages = await db.get('images');
      if (existingImages && existingImages.length > 0) {
        const answer = await questionAsync(rl, '\'images\' is already set in the database. Do you want to continue seeding? (y/n) ');
        if (answer.toLowerCase() !== 'y') {
          log.info('Seeding aborted by the user.');
          rl.close();
          return;
        }
      }
      await performSeeding();
    } catch (error) {
      log.error(`Failed during seeding process: ${error}`);
    } finally {
      rl.close();
    }
  });

program
  .command('createUser')
  .description('Creates a new Admin user')
  .action(async () => {
    const readline = require('readline');
    const { db } = require('../../handlers/db.js');
    const { v4: uuidv4 } = require('uuid');
    const bcrypt = require('bcrypt');
    const log = new (require('cat-loggr'))();

    const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    function questionAsync(query) {
      return new Promise(resolve => rl.question(query, resolve));
    }

    async function doesUserExist(username) {
      const users = await db.get('users');
      return users ? users.some(user => user.username === username) : false;
    }

    async function doesEmailExist(email) {
      const users = await db.get('users');
      return users ? users.some(user => user.email === email) : false;
    }

    async function initializeUsersTable(username, email, password) {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const userId = uuidv4();
      const users = [{ userId, username, email, password: hashedPassword, accessTo: [], admin: true }];
      return db.set('users', users);
    }

    async function addUserToUsersTable(username, email, password) {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const userId = uuidv4();
      const users = await db.get('users') || [];
      users.push({ userId, username, email, password: hashedPassword, accessTo: [], admin: true });
      return db.set('users', users);
    }

    async function createUser(username, email, password) {
      const users = await db.get('users');
      if (!users) {
        return initializeUsersTable(username, email, password);
      } else {
        return addUserToUsersTable(username, email, password);
      }
    }

    function isValidEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    try {
      log.info('Create a new *admin* user for the skyport panel:');
      log.info('You can make regular users from the admin -> users page!');
      const username = await questionAsync("username: ");
      const email = await questionAsync("email: ");

      if (!isValidEmail(email)) {
        log.error("Invalid email!");
        rl.close();
        return;
      }

      const password = await questionAsync("password: ");

      const userExists = await doesUserExist(username);
      const emailExists = await doesEmailExist(email);
      if (userExists || emailExists) {
        log.error("User already exists!");
        rl.close();
        return;
      }

      await createUser(username, email, password);
      log.info("Done! User created.");
    } catch (error) {
      log.error(`Error creating user: ${error}`);
    } finally {
      rl.close();
    }
  });

program.parse(process.argv);
