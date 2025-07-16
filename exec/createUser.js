const readline = require('readline');
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;

// readline para input estándar
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

// Función para preguntar con ocultación (solo para password)
function askHiddenQuestion(query) {
    return new Promise((resolve) => {
        const stdin = process.openStdin();
        process.stdout.write(query);
        let password = '';
        stdin.on('data', (char) => {
            char = char + '';
            switch (char) {
                case '\n':
                case '\r':
                case '\u0004':
                    stdin.pause();
                    process.stdout.write('\n');
                    resolve(password);
                    break;
                case '\u0003': // Ctrl+C
                    process.exit();
                    break;
                default:
                    process.stdout.write('*');
                    password += char;
                    break;
            }
        });
    });
}

// Función para leer preguntas normales
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// Parsear argumentos --key=value
function parseArguments() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
        const [key, value] = arg.split('=');
        if (key.startsWith('--')) {
            args[key.slice(2)] = value;
        }
    });
    return args;
}

// Validar email simple
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validar contraseña (mínimo 6 caracteres)
function isValidPassword(password) {
    return password && password.length >= 6;
}

// Verificar si usuario existe
async function doesUserExist(username) {
    const users = await db.get('users');
    return users ? users.some(user => user.username === username) : false;
}

// Verificar si email existe
async function doesEmailExist(email) {
    const users = await db.get('users');
    return users ? users.some(user => user.email === email) : false;
}

// Crear tabla usuarios inicial con admin
async function initializeUsersTable(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = [{ userId, username, email, password: hashedPassword, accessTo: [], admin: true, verified: true }];
    return db.set('users', users);
}

// Agregar usuario a tabla existente
async function addUserToUsersTable(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = await db.get('users') || [];
    users.push({ userId, username, email, password: hashedPassword, accessTo: [], admin: true, verified: true });
    return db.set('users', users);
}

// Crear usuario (decide si inicializar o agregar)
async function createUser(username, email, password) {
    const users = await db.get('users');
    if (!users) {
        return initializeUsersTable(username, email, password);
    } else {
        return addUserToUsersTable(username, email, password);
    }
}

// Función principal
async function main() {
    const args = parseArguments();

    let username, email, password;

    if (args.username && args.email && args.password) {
        username = args.username;
        email = args.email;
        password = args.password;
    } else {
        console.log('Create a new *admin* user for the Skyport Panel:');
        console.log('You can make regular users from the admin -> users page.');

        username = await askQuestion('Username: ');
        email = await askQuestion('Email: ');

        if (!isValidEmail(email)) {
            console.error('Invalid email!');
            rl.close();
            return;
        }

        password = await askHiddenQuestion('Password: ');
        if (!isValidPassword(password)) {
            console.error('Password must be at least 6 characters long!');
            rl.close();
            return;
        }
    }

    const userExists = await doesUserExist(username);
    const emailExists = await doesEmailExist(email);

    if (userExists) {
        console.error('Username already exists!');
        rl.close();
        return;
    }
    if (emailExists) {
        console.error('Email already exists!');
        rl.close();
        return;
    }

    try {
        await createUser(username, email, password);
        console.log('Done! User created.');
    } catch (err) {
        console.error('Error creating user:', err);
    } finally {
        rl.close();
    }
}

main().catch(err => {
    console.error('Unexpected error:', err);
    rl.close();
});
