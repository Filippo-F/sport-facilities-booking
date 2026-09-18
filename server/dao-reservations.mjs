
/* Data Access Object (DAO) module for reservations */

import db from './db.mjs';

/* Promise wrappers around the sqlite3 callback API, to keep the operations below readable. */
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

/* The operations that modify reservations first check the availability and then write, with
   several awaits in between: two parallel requests could both read the same availability and
   together rent more equipment than exists (facilities are already protected by the UNIQUE
   constraint, equipment is not). "exclusive" runs these operations one at a time, in arrival order,
   by chaining each one after the previous. This is enough because the server is a single Node process;
   with several processes the checks would have to move into DB transactions. */
let lastOperation = Promise.resolve();
const exclusive = (operation) => {
  const result = lastOperation.then(operation);
  lastOperation = result.catch(() => {});  // a failed operation must not block the following ones
  return result;
};

/* Current availability of every equipment type, as a map id -> quantity.
   Only equipment belonging to an existing reservation counts as rented. */
const equipmentAvailability = async () => {
  // The query computes the available quantity of each equipment type as stock minus the sum of quantities in active reservations.
  // If no reservations are present -> sum is NULL -> IFNULL returns 0.
  // Then the LEFT JOIN is used to include equipment types that have no reservations at all, so they are still counted as available.
  const rows = await dbAll(`SELECT et.id, et.stock - IFNULL(SUM(re.quantity), 0) AS available
    FROM equipmentTypes et
    LEFT JOIN reservationEquipment re ON re.equipmentTypeId = et.id
      AND re.reservationId IN (SELECT id FROM reservations)
    GROUP BY et.id`);
  const avail = {};
  for (const r of rows)
    avail[r.id] = r.available;  // map id -> available quantity
  return avail;
};

/* Equipment rules for a facility type: [{id, name, minQty}] */
const typeRules = (typeId) => dbAll(
  // The query retrieves the allowed equipment for a given facility type, with its minimum quantity.
  `SELECT et.id, et.name, te.minQty FROM typeEquipment te
   JOIN equipmentTypes et ON et.id = te.equipmentTypeId
   WHERE te.facilityTypeId = ?`, [typeId]);

// All facilities with their type and current availability, for direct selection (not automatic assignment).
const listFacilities = async () => {
  // The query retrieves all facilities with their type and current availability (true/false).
  const rows = await dbAll(`SELECT f.code, f.typeId, ft.name AS type,
      f.code NOT IN (SELECT facilityCode FROM reservations) AS available
    FROM facilities f JOIN facilityTypes ft ON ft.id = f.typeId
    ORDER BY f.code`);
  return rows.map(r => ({ ...r, available: r.available === 1 }));  // we create a new array of objects with the same properties as the rows, 
                                                                   // but with available converted to a boolean ("===" always returns a boolean)
};

/* Retrieve one reservation with its equipment, or undefined. userId is included for
   ownership checks and must not be sent to the client (for security reasons). */
const getReservation = async (id) => {
  const row = await dbGet(`SELECT r.id, r.userId, r.facilityCode, f.typeId, ft.name AS type
    FROM reservations r
    JOIN facilities f ON f.code = r.facilityCode
    JOIN facilityTypes ft ON ft.id = f.typeId
    WHERE r.id = ?`, [id]);
  if (!row)
    return undefined;
  // Now retrieve the equipment for this reservation, as a list of {id, name, quantity}.
  row.equipment = await dbAll(`SELECT et.id, et.name, re.quantity
    FROM reservationEquipment re JOIN equipmentTypes et ON et.id = re.equipmentTypeId
    WHERE re.reservationId = ?`, [id]);
  return row;
};

// Reservations of a given user, each with its equipment.
const listReservationsByUser = async (userId) => {
  const reservations = await dbAll(`SELECT r.id, r.facilityCode, f.typeId, ft.name AS type
    FROM reservations r
    JOIN facilities f ON f.code = r.facilityCode
    JOIN facilityTypes ft ON ft.id = f.typeId
    WHERE r.userId = ? ORDER BY r.id`, [userId]);
  const equipment = await dbAll(`SELECT re.reservationId, et.id, et.name, re.quantity
    FROM reservationEquipment re
    JOIN equipmentTypes et ON et.id = re.equipmentTypeId
    JOIN reservations r ON r.id = re.reservationId
    WHERE r.userId = ?`, [userId]);
    // Now we merge the two results: for each reservation, we add an "equipment" property with the list of equipment.
  return reservations.map(r => ({
    ...r,
    equipment: equipment.filter(e => e.reservationId === r.id)
      .map(e => ({ id: e.id, name: e.name, quantity: e.quantity }))
  }));
};

/* Validates the requested equipment list against the rules of a facility type.
   Returns an {error, code} object on failure, undefined if everything is fine.
   - every requested item must be allowed for the facility type;
   - every mandatory item must be present at least at its minimum quantity;
   - users with a negative score can only request the exact mandatory minimums.
   When currentQuantities is provided (reservation update), a negative score
   only allows removing equipment with respect to the current reservation. */
const checkEquipmentRules = (rules, equipment, score, currentQuantities) => {
  for (const item of equipment) {
    const rule = rules.find(r => r.id === item.id);
    if (!rule)
      return { error: 'Equipment not allowed for this facility type', code: 422 };
    if (item.quantity < rule.minQty)
      return { error: `At least ${rule.minQty} ${rule.name} required for this facility type`, code: 422 };
  }
  for (const rule of rules.filter(r => r.minQty > 0)) {
    if (!equipment.some(e => e.id === rule.id)) {
      // "some" returns true if at least one element satisfies the condition, false otherwise
      return { error: `Mandatory equipment missing: ${rule.name}`, code: 422 };
    }
  }
  if (score < 0) {
    if (currentQuantities === undefined) {
      // creation: only the mandatory minimums can be requested
      for (const item of equipment) {
        const rule = rules.find(r => r.id === item.id);
        if (rule.minQty === 0 || item.quantity > rule.minQty)
          return { error: 'With a negative score only the mandatory minimum equipment can be requested', code: 409 };
      }
    } else {
      // update: equipment can only be removed, nothing can be added
      for (const item of equipment) {
        const current = currentQuantities[item.id];
        if (current === undefined || item.quantity > current)
          return { error: 'With a negative score equipment can only be removed, not added', code: 409 };
      }
    }
  }
  return undefined;
};

/* Creates a reservation in a single operation. Exactly one of facilityCode
   (direct selection) or typeId (automatic assignment) is provided.
   All business rules are checked here, on the current state of the database. */
const createReservation = async (user, facilityCode, typeId, equipment) => {
  // resolve the target facility and its type
  if (facilityCode !== undefined) {
    const facility = await dbGet('SELECT code, typeId FROM facilities WHERE code = ?', [facilityCode]);
    if (!facility)
      return { error: 'Unknown facility', code: 422 };
    const taken = await dbGet('SELECT id FROM reservations WHERE facilityCode = ?', [facilityCode]);
    if (taken)
      return { error: 'Facility already booked', code: 409 };
    typeId = facility.typeId;
  } else {
    const type = await dbGet('SELECT id FROM facilityTypes WHERE id = ?', [typeId]);
    if (!type)
      return { error: 'Unknown facility type', code: 422 };
    const free = await dbGet(`SELECT code FROM facilities
      WHERE typeId = ? AND code NOT IN (SELECT facilityCode FROM reservations)
      ORDER BY code LIMIT 1`, [typeId]);  // "LIMIT 1" is used to get only one free facility, if any
    if (!free)
      return { error: 'No facility of this type is currently available', code: 409 };
    facilityCode = free.code;
  }

  // 30-second rule: the user cannot re-book a facility type they released less than 30 seconds ago
  const release = await dbGet('SELECT releasedAt FROM releases WHERE userId = ? AND facilityTypeId = ?', [user.id, typeId]);
  if (release && Date.now() - release.releasedAt < 30 * 1000)  // "30 * 1000" converts seconds to milliseconds
    return { error: 'Too early to book this facility type again, please wait a few seconds', code: 409 };

  // equipment rules (mandatory minimums, allowed items, score restrictions)
  const rules = await typeRules(typeId);
  const ruleError = checkEquipmentRules(rules, equipment, user.score);
  if (ruleError)
    return ruleError;

  // equipment availability, computed on the current state
  const avail = await equipmentAvailability();
  for (const item of equipment) {
    if (item.quantity > avail[item.id]) {
      const rule = rules.find(r => r.id === item.id);
      return { error: `Not enough ${rule.name} available (${avail[item.id]} left)`, code: 409 };
    }
  }

  // book the facility: the UNIQUE constraint (defined in the db schema) on facilityCode rejects a
  // facility that was booked in the meantime by another request
  let reservationId;
  try {
    const result = await dbRun('INSERT INTO reservations (userId, facilityCode) VALUES (?, ?)', [user.id, facilityCode]);
    reservationId = result.lastID;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT')   // failure due to UNIQUE constraint violation on facilityCode
      return { error: 'Facility already booked', code: 409 };
    throw err;
  }

  try {
    for (const item of equipment)
      await dbRun('INSERT INTO reservationEquipment (reservationId, equipmentTypeId, quantity) VALUES (?, ?, ?)',
        [reservationId, item.id, item.quantity]);
  } catch (err) {
    // unexpected failure: do not leave a reservation without its equipment
    await dbRun('DELETE FROM reservationEquipment WHERE reservationId = ?', [reservationId]);
    await dbRun('DELETE FROM reservations WHERE id = ?', [reservationId]);
    throw err;
  }

  return getReservation(reservationId);
};

/* Replaces the equipment of a reservation of the given user with the new
   list. Quantity increases are checked against the current availability. */
const updateReservationEquipment = async (user, reservationId, equipment) => {
  const reservation = await getReservation(reservationId);
  if (!reservation || reservation.userId !== user.id)
    return { error: 'Reservation not found', code: 404 };

  const currentQuantities = {};
  for (const e of reservation.equipment)
    currentQuantities[e.id] = e.quantity;

  const rules = await typeRules(reservation.typeId);
  const ruleError = checkEquipmentRules(rules, equipment, user.score, currentQuantities);
  if (ruleError)
    return ruleError;

  // availability must cover the quantity increases only
  const avail = await equipmentAvailability();
  for (const item of equipment) {
    const increase = item.quantity - (currentQuantities[item.id] ?? 0);
    if (increase > avail[item.id]) {
      const rule = rules.find(r => r.id === item.id);
      return { error: `Not enough ${rule.name} available (${avail[item.id]} left)`, code: 409 };
    }
  }

  // replace the equipment list in a single operation: delete the old items and insert the new ones
  await dbRun('DELETE FROM reservationEquipment WHERE reservationId = ?', [reservationId]);
  for (const item of equipment)
    await dbRun('INSERT INTO reservationEquipment (reservationId, equipmentTypeId, quantity) VALUES (?, ?, ?)',
      [reservationId, item.id, item.quantity]);

  return getReservation(reservationId);
};

/* Deletes a reservation of the given user, restoring facility and equipment
   availability. The score is decreased by 1 and the deletion time is recorded
   for the 30-second rule on that facility type. */
const deleteReservation = async (user, reservationId) => {
  const reservation = await getReservation(reservationId);
  if (!reservation || reservation.userId !== user.id)
    return { error: 'Reservation not found', code: 404 };

  // the WHERE clause on userId on the line below makes the ownership check race-safe 
  // since the reservation could have been deleted by another request in the meantime
  const result = await dbRun('DELETE FROM reservations WHERE id = ? AND userId = ?', [reservationId, user.id]);
  if (result.changes === 0)
    return { error: 'Reservation not found', code: 404 };
  await dbRun('DELETE FROM reservationEquipment WHERE reservationId = ?', [reservationId]);

  await dbRun('UPDATE users SET score = score - 1 WHERE id = ?', [user.id]);
  await dbRun('INSERT OR REPLACE INTO releases (userId, facilityTypeId, releasedAt) VALUES (?, ?, ?)',
    [user.id, reservation.typeId, Date.now()]);

  return {};
};

export default {
  listFacilities,
  listReservationsByUser,
  // the operations that change availability are exported wrapped in "exclusive" (see the top of the file)
  createReservation: (...args) => exclusive(() => createReservation(...args)),
  updateReservationEquipment: (...args) => exclusive(() => updateReservationEquipment(...args)),
  deleteReservation: (...args) => exclusive(() => deleteReservation(...args)),
};
