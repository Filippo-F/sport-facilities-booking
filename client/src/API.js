
/** API module: all the HTTP calls towards the server are grouped here. **/

const SERVER_URL = 'http://localhost:3001/api/';

/**
 * Utility function for parsing the HTTP response.
 * The server always answers with JSON; errors have the shape { error: <message> }.
 */
function getJson(httpResponsePromise) {
  return new Promise((resolve, reject) => {
    httpResponsePromise
      .then((response) => {
        if (response.ok) {
          response.json()
            .then(json => resolve(json))
            .catch(() => reject({ error: 'Cannot parse server response' }));
        } else {
          // the error message is in the response body
          response.json()
            .then(obj => reject(obj))
            .catch(() => reject({ error: 'Cannot parse server response' }));
        }
      })
      .catch(() => reject({ error: 'Cannot communicate with the server' })); // connection error
  });
}

/*** Public data ***/

// Facility types with availability counts and the allowed equipment for each type.
const getTypes = () => getJson(
  fetch(SERVER_URL + 'types')
);

// Equipment types with stock and current availability.
const getEquipment = () => getJson(
  fetch(SERVER_URL + 'equipment')
);

/*** Reservations ***/

// All facilities with their current availability (requires authentication).
const getFacilities = () => getJson(
  fetch(SERVER_URL + 'facilities', { credentials: 'include' })
);

// Reservations of the currently logged-in user.
const getReservations = () => getJson(
  fetch(SERVER_URL + 'reservations', { credentials: 'include' })
);

/**
 * Creates a reservation. The booking object contains either facilityCode
 * (direct selection) or typeId (automatic assignment), plus the equipment
 * list with the total requested quantities.
 */
const createReservation = (booking) => getJson(
  fetch(SERVER_URL + 'reservations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking),
  })
);

// Replaces the equipment list of one of the user's reservations.
const updateReservation = (reservationId, equipment) => getJson(
  fetch(SERVER_URL + 'reservations/' + reservationId, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ equipment }),
  })
);

// Deletes one of the user's reservations.
const deleteReservation = (reservationId) => getJson(
  fetch(SERVER_URL + 'reservations/' + reservationId, {
    method: 'DELETE',
    credentials: 'include',
  })
);

/*** Authentication ***/

// Login with username and password.
const logIn = (credentials) => getJson(
  fetch(SERVER_URL + 'sessions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
);

// Second authentication step: verify the TOTP code.
const totpVerify = (code) => getJson(
  fetch(SERVER_URL + 'login-totp', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
);

// Information about the currently logged-in user, if any.
const getUserInfo = () => getJson(
  fetch(SERVER_URL + 'sessions/current', { credentials: 'include' })
);

// Logout.
const logOut = () => getJson(
  fetch(SERVER_URL + 'sessions/current', {
    method: 'DELETE',
    credentials: 'include',
  })
);

const API = {
  getTypes, getEquipment,
  getFacilities, getReservations, createReservation, updateReservation, deleteReservation,
  logIn, totpVerify, getUserInfo, logOut
};
export default API;
