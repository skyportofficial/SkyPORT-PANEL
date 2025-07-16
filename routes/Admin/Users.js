const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');

const saltRounds = 10;

async function getUsers() {
  return await db.get('users') || [];
}

async function doesUserExist(username, excludeId = null) {
  const users = await getUsers();
  return users.some(user => user.username === username && user.userId !== excludeId);
}

async function doesEmailExist(email, excludeId = null) {
  const users = await getUsers();
  return users.some(user => user.email === email && user.userId !== excludeId);
}

router.get('/admin/users', isAdmin, async (req, res) => {
  try {
    res.render('admin/users', {
      req,
      user: req.user,
      users: await getUsers(),
    });
  } catch (err) {
    res.status(500).send('Error loading users.');
  }
});

router.post('/users/create', isAdmin, async (req, res) => {
  try {
    const { username, email, password, admin, verified } = req.body;

    if (!username || !email || !password) {
      return res.status(400).send('Username, email, and password are required.');
    }

    const parsedAdmin = String(admin).toLowerCase() === 'true';
    const parsedVerified = String(verified).toLowerCase() === 'true';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send('Invalid email format.');
    }

    if (await doesUserExist(username)) {
      return res.status(400).send('User already exists.');
    }

    if (await doesEmailExist(email)) {
      return res.status(400).send('Email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
      userId: uuidv4(),
      username,
      email,
      password: hashedPassword,
      accessTo: [],
      admin: parsedAdmin,
      verified: parsedVerified,
    };

    const users = await getUsers();
    users.push(newUser);
    await db.set('users', users);

    logAudit(req.user.userId, req.user.username, 'user:create', req.ip);

    res.status(201).send({
      userId: newUser.userId,
      username: newUser.username,
      email: newUser.email,
      admin: newUser.admin,
      verified: newUser.verified,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error.');
  }
});

router.delete('/user/delete', isAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    const users = await getUsers();
    const userIndex = users.findIndex(user => user.userId === userId);

    if (userIndex === -1) {
      return res.status(400).send('The specified user does not exist');
    }

    const userToDelete = users[userIndex];
    if (userToDelete.username === 'admin') {
      return res.status(403).send('You cannot delete the root admin.');
    }

    users.splice(userIndex, 1);
    await db.set('users', users);

    logAudit(req.user.userId, req.user.username, 'user:delete', req.ip);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error.');
  }
});

router.get('/admin/users/edit/:userId', isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const users = await getUsers();
    const user = users.find(user => user.userId === userId);

    if (!user) return res.status(404).send('User not found');

    res.render('admin/edit-user', {
      req,
      user: req.user,
      editUser: user,
    });
  } catch (err) {
    res.status(500).send('Internal server error.');
  }
});

router.post('/admin/users/edit/:userId', isAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { username, email, password, admin, verified } = req.body;

    if (!username || !email) {
      return res.status(400).send('Username and email are required.');
    }

    const users = await getUsers();
    const userIndex = users.findIndex(user => user.userId === userId);

    if (userIndex === -1) {
      return res.status(404).send('User not found');
    }

    if (await doesUserExist(username, userId)) {
      return res.status(400).send('Username already exists.');
    }

    if (await doesEmailExist(email, userId)) {
      return res.status(400).send('Email already exists.');
    }

    users[userIndex].username = username;
    users[userIndex].email = email;
    users[userIndex].admin = String(admin).toLowerCase() === 'true';
    users[userIndex].verified = String(verified).toLowerCase() === 'true';

    if (password) {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      users[userIndex].password = hashedPassword;
    }

    await db.set('users', users);
    logAudit(req.user.userId, req.user.username, 'user:edit', req.ip);

    if (req.user.userId === userId) {
      if (typeof req.logout === 'function') {
        return req.logout(err => {
          if (err) return next(err);
          res.redirect('/login?err=UpdatedCredentials');
        });
      } else {
        req.session.destroy(() => {
          res.redirect('/login?err=UpdatedCredentials');
        });
      }
    } else {
      res.redirect('/admin/users');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error.');
  }
});

module.exports = router;
