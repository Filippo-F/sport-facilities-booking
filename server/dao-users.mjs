
/* Data Access Object (DAO) module for accessing users data */

import db from './db.mjs';
import crypto from 'crypto';  // crypto module is used for hashing passwords and verifying TOTP codes

// Returns the user's information given its id. Used at every request to
// rebuild req.user with up-to-date values (the score may change during the session).
const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE id=?';  // "const" since it cannot be reassigned
    db.get(sql, [id], (err, row) => {
      if (err)
        reject(err);  // reject the promise with the error
      else if (row === undefined)
        resolve({ error: 'User not found.' });
      else {
        // The local strategy looks for "username": we expose the email with that name.
        const user = { id: row.id, username: row.email, name: row.name, secret: row.secret, lastTotpStep: row.lastTotpStep, score: row.score };
        resolve(user);
      }
    });
  });
};

// Used at log-in time to verify username and password.
const getUser = (email, password) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE email=?';
    db.get(sql, [email], (err, row) => {
      if (err) {
        reject(err);
      } else if (row === undefined) {
        resolve(false); // no user found with that email
      }
      else {
        const user = { id: row.id, username: row.email, name: row.name, secret: row.secret, lastTotpStep: row.lastTotpStep, score: row.score };

        // Hash comparison is done asynchronously since this is CPU-intensive and we want to avoid blocking the server.
        crypto.scrypt(password, row.salt, 32, function (err, hashedPassword) {   // hash the provided password with the stored salt and compare it to the stored hash
          if (err) reject(err);
          if (!crypto.timingSafeEqual(Buffer.from(row.hash, 'hex'), hashedPassword))   // timingSafeEqual is used to prevent timing attacks. 
            resolve(false);
          else
            resolve(user);
        });
      }
    });
  });
};

// Stores the last accepted TOTP step, to reject reused or older codes.
const updateLastTotpStep = (userId, lastTotpStep) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET lastTotpStep = ? WHERE id = ?';
    db.run(sql, [lastTotpStep, userId], function (err) {
      if (err) {
        reject(err);
      }
      if (this.changes !== 1) {   // if no rows were updated, it means the user was not found
        resolve({ error: 'User not found.' });
      } else {
        resolve(this.changes);
      }
    });
  });
};

// Brings a (negative) score back to zero, after a successful TOTP verification at login.
const resetScore = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET score = 0 WHERE id = ?';
    db.run(sql, [userId], function (err) {
      if (err)
        reject(err);
      else
        resolve(this.changes);
    });
  });
};

// Export the functions as an object, so they can be imported and used in other modules.
export default {
  getUserById,
  getUser,
  updateLastTotpStep,
  resetScore
};
