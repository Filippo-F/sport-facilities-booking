
/** DB access module **/

import sqlite from 'sqlite3';

// open the database
const db = new sqlite.Database('sport.db', (err) => {
  if (err) throw err;
});

// SQLite ignores the FOREIGN KEY clauses of the schema unless this is enabled on the
// connection: with it, the DB itself rejects rows that point to non-existing users,
// reservations or equipment. It is queued before any request, so it always runs first.
db.run('PRAGMA foreign_keys = ON', (err) => {
  if (err) throw err;
});

export default db;
