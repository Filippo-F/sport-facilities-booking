
/* Data Access Object (DAO) module for facilities and equipment data */

import db from './db.mjs';

// Facility types with total/available facility counts and the list of
// allowed equipment for each type (minQty = 0 means optional).
// Availability is always computed from the current reservations, never stored.
const listTypes = () => {
  return new Promise((resolve, reject) => {
    // The first query gets the facility types with total and available counts.
    const sql = `SELECT ft.id, ft.name,
      (SELECT COUNT(*) FROM facilities f WHERE f.typeId = ft.id) AS total,
      (SELECT COUNT(*) FROM facilities f WHERE f.typeId = ft.id
         AND f.code NOT IN (SELECT facilityCode FROM reservations)) AS available
      FROM facilityTypes ft`;
    db.all(sql, [], (err, types) => {
      if (err)
        return reject(err);
      // This second query instead gets the allowed equipment for each type, and we merge the results in a single object.
      const sql2 = `SELECT te.facilityTypeId, et.id, et.name, te.minQty
        FROM typeEquipment te JOIN equipmentTypes et ON et.id = te.equipmentTypeId`;
      db.all(sql2, [], (err, rules) => {
        if (err)
          return reject(err);
        // Now we merge the two results: for each type, we add an "equipment" property with the list of allowed equipment.
        const result = types.map(t => ({    // "...t" is used to copy all the properties of "t" into the new object
          ...t,
          equipment: rules.filter(r => r.facilityTypeId === t.id)
            .map(r => ({ id: r.id, name: r.name, minQty: r.minQty }))
        }));
        resolve(result);
      });
    });
  });
};

// Equipment types with total stock and currently available quantity
// (stock minus the quantities rented in active reservations).
const listEquipment = () => {
  return new Promise((resolve, reject) => {
    // This query is needed to retrieve the equipment types with their stock and the currently available quantity, 
    // computed as stock minus the sum of quantities in active reservations.
    const sql = `SELECT et.id, et.name, et.stock,
      et.stock - IFNULL((SELECT SUM(re.quantity) FROM reservationEquipment re
        WHERE re.equipmentTypeId = et.id), 0) AS available
      FROM equipmentTypes et`;
    db.all(sql, [], (err, rows) => {
      if (err)
        reject(err);
      else
        resolve(rows);
    });
  });
};

export default {
  listTypes,
  listEquipment
};
