
/*** Importing modules ***/
import express from 'express'; // express web framework
import morgan from 'morgan';  // logging middleware
import { check, validationResult } from 'express-validator'; // validation middleware
import cors from 'cors';  // CORS middleware

/** Authentication-related imports **/
import passport from 'passport';            // authentication middleware
import LocalStrategy from 'passport-local'; // authentication strategy (username and password)

import { TOTP } from 'otpauth';  

import sportDao from './dao-sport.mjs'; // module for accessing facilities and equipment in the DB
import userDao from './dao-users.mjs';  // module for accessing the users table in the DB
import reservationsDao from './dao-reservations.mjs'; // module for accessing reservations in the DB

/*** init express and set-up the middlewares ***/
const app = express();
app.use(morgan('dev'));
app.use(express.json());

/** Set up and enable Cross-Origin Resource Sharing (CORS) **/
const corsOptions = {
  origin: 'http://localhost:5173',  // the only origin we allow to access the server
  credentials: true,
};
app.use(cors(corsOptions));   // enable CORS

/*** Passport ***/

/** Authentication strategy: search in the DB a user with matching username (email) and password. **/
passport.use(new LocalStrategy(async function verify(username, password, callback) {  // function is async. since returns a promise, passport will wait for it to resolve before proceeding
  let user;
  try {
    user = await userDao.getUser(username, password);
  } catch (err) {
    // passport does not handle a rejected promise: without this catch a DB error would
    // become an unhandled rejection and terminate the whole server process
    return callback(err);
  }
  if (!user)
    return callback(null, false, 'Incorrect username or password');  // no user found -> say "incorrect username or password" (generic message, not revealing which one is wrong)
  
  return callback(null, user);   // "null" means no error, "user" means authentication succeeded.
}));

// After a successful authentication, the whole user object given by the strategy is serialized in the session.
passport.serializeUser(function (user, callback) {
  callback(null, user);
});

// At every request the user is reloaded from the DB, so that req.user always
// carries up-to-date values (in particular the score, which may change during the session).
passport.deserializeUser(function (user, callback) {
  return userDao.getUserById(user.id)
    .then(user => {
      // getUserById resolves { error } when the user no longer exists: "false" tells passport
      // to drop the login, otherwise that object would become req.user and pass isLoggedIn
      if (user.error)
        return callback(null, false);
      return callback(null, user);
    })
    .catch(err => callback(err, null)); // DB error
});

/** Creating the session */
import session from 'express-session';

// The secret that signs the session ID cookie comes from the environment, so it never lives in the code.
// The fallback is only for local development: in production the server refuses to start without a real secret.
// "||" (not "??") so that an empty variable also counts as missing.
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret-change-me');
if (!sessionSecret) {
  console.error('SESSION_SECRET must be set when NODE_ENV=production');
  process.exit(1);
}

app.use(session({
  secret: sessionSecret,  // secret used to sign the session ID cookie
  resave: false,    // does not force the session to be re-saved on every request IF IT WAS NOT MODIFIED
  saveUninitialized: false,  // does not create empty sessions or never used sessions
}));
app.use(passport.authenticate('session'));

/** TOTP verification with replay protection.
 * A code is accepted only if it is valid within the allowed window and its
 * time step is more recent than the last accepted one for this user.
 */
function verifyTotpToken(user, token) {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,   // 6 digits
    period: 30, // 30 seconds
    secret: user.secret   // the secret is stored in the DB for each user
  });

  const delta = totp.validate({ token, window: 1 });   // window=1 means that the previous, current and next time steps are accepted (to account for clock drift)
  if (delta === null) {
    return false; // invalid code
  }

  // delta is the distance in steps between the provided token and the current
  // step, so the step the token belongs to is current counter + delta.
  const actualStep = totp.counter() + delta;

  if (actualStep <= user.lastTotpStep)
    return false;  // reject replayed or older codes

  user.lastTotpStep = actualStep;
  return true;
}

/** Authentication verification middleware **/
const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();  // user is authenticated, proceed to the next middleware
  }
  return res.status(401).json({ error: 'Not authenticated' });  
}

// Formats "express-validator" errors as strings
const errorFormatter = ({ location, msg, path }) => {  // "path" instead of "param" since we are using the most recent version of express-validator (different from the previous ones)
  return `${location}[${path}]: ${msg}`;
};

/*** Sport center APIs (public) ***/

// GET /api/types
// Facility types with availability counts and allowed equipment. Public:
// this data is shown on the first page to anybody.
app.get('/api/types', (req, res) => {
  sportDao.listTypes()
    .then(types => res.json(types))
    .catch(() => res.status(500).json({ error: 'Database error' }));
});

// GET /api/equipment
// Equipment types with stock and current availability. Public as well.
app.get('/api/equipment', (req, res) => {
  sportDao.listEquipment()
    .then(equipment => res.json(equipment))
    .catch(() => res.status(500).json({ error: 'Database error' }));
});

/*** Reservations APIs (authenticated users) ***/

// GET /api/facilities
// All facilities with their availability, used for direct facility selection.
app.get('/api/facilities', isLoggedIn, (req, res) => {    // "isLoggedIn" middleware checks if the user is authenticated, otherwise returns 401
  reservationsDao.listFacilities()
    .then(facilities => res.json(facilities))
    .catch(() => res.status(500).json({ error: 'Database error' }));
});

// GET /api/reservations
// Reservations of the current user. The user id comes from the session only to avoid tampering with the request.
app.get('/api/reservations', isLoggedIn, (req, res) => {
  reservationsDao.listReservationsByUser(req.user.id)
    .then(reservations => res.json(reservations))
    .catch(() => res.status(500).json({ error: 'Database error' }));
});

// Validation rules for the equipment list, used in both POST and PUT requests.
const equipmentChecks = [
  check('equipment').isArray(),   // the equipment field must be an array (e.g. [{id: 1, quantity: 2}, {id: 2, quantity: 1}])
  check('equipment.*.id').isInt({ min: 1 }),   // "*" checks each element of the array, so each element must have an "id" field that is an integer >= 1
  check('equipment.*.quantity').isInt({ min: 1 }),   // each element must have a "quantity" field that is an integer >= 1
  // the same equipment type cannot appear twice in the list
  check('equipment').custom(equipment => {   // "custom" allows us to define a custom validation function
    // if the number of unique ids is different from the number of elements, there are duplicates
    if (Array.isArray(equipment) && new Set(equipment.map(e => e.id)).size !== equipment.length)  
      // "Set" is a structure containing only unique values, so if the size of the set is different from the length of the array, there are duplicates
      throw new Error('Duplicated equipment in the request');
    return true;
  }),
];

// POST /api/reservations
// Creates a reservation in a single request: either facilityCode (direct
// selection) or typeId (automatic assignment) must be provided, plus the
// total requested equipment quantities. All checks happen server-side here.
app.post('/api/reservations', isLoggedIn,
  [
    check('facilityCode').isString().isLength({ min: 1, max: 10 }).optional(),  // "max: 10" for sanity checks to evitate absurdly long strings.
    check('typeId').isInt({ min: 1 }).optional(),  // "optional()" because we can either provide facilityCode or typeId, but not both
    ...equipmentChecks,    // spread operator includes all the above validation rules in the "equipmentChecks" array
  ],
  async (req, res) => {
    const errors = validationResult(req).formatWith(errorFormatter);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array().join(', ') }); 
    }
    // exactly one selection mechanism must be used -> if both are undefined or both are defined, return an error
    if ((req.body.facilityCode === undefined) === (req.body.typeId === undefined)) { // "===" is used to check if both are undefined or both are defined
      return res.status(422).json({ error: 'Provide either facilityCode or typeId' });
    }

    try {
      const result = await reservationsDao.createReservation(req.user, req.body.facilityCode, req.body.typeId, req.body.equipment);
      if (result.error)
        res.status(result.code).json({ error: result.error });
      else
        res.status(201).json({ id: result.id, facilityCode: result.facilityCode, typeId: result.typeId, type: result.type, equipment: result.equipment });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Database error' });
    }
  }
);

// PUT /api/reservations/:id
// Replaces the equipment of one of the current user's reservations.
app.put('/api/reservations/:id', isLoggedIn,
  [
    check('id').isInt({ min: 1 }),
    ...equipmentChecks,  
  ],
  async (req, res) => {
    const errors = validationResult(req).formatWith(errorFormatter);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array().join(', ') });
    }

    try {
      // "req.params.id" is a string, so we convert it to a number with "Number()".
      const result = await reservationsDao.updateReservationEquipment(req.user, Number(req.params.id), req.body.equipment); 
      if (result.error)
        res.status(result.code).json({ error: result.error });
      else
        res.json({ id: result.id, facilityCode: result.facilityCode, typeId: result.typeId, type: result.type, equipment: result.equipment });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Database error' });
    }
  }
);

// DELETE /api/reservations/:id
// Deletes one of the current user's reservations. The score is decreased (by 1) and
// the deletion time is recorded to enforce the 30-second rule.
app.delete('/api/reservations/:id', isLoggedIn,
  [check('id').isInt({ min: 1 })],
  async (req, res) => {
    const errors = validationResult(req).formatWith(errorFormatter);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array().join(', ') });
    }

    try {
      const result = await reservationsDao.deleteReservation(req.user, Number(req.params.id));
      if (result.error)
        res.status(result.code).json({ error: result.error });
      else
        res.status(200).json({});
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Database error' });
    }
  }
);

/*** Users APIs ***/

function clientUserInfo(req) {
  const user = req.user;
  return { id: user.id, username: user.username, name: user.name, score: user.score, canDoTotp: user.secret ? true : false, isTotp: req.session.method === 'totp' }; // "canDoTotp" is true if the user has a TOTP secret, "isTotp" is true if the user has completed the second authentication step with TOTP
}

// POST /api/sessions
// Login with username and password. THE ERROR MESSAGE IS GENERIC ON PURPOSE.
app.post('/api/sessions', function (req, res, next) {
  passport.authenticate('local', (err, user, info) => {   // "local" is the name of the strategy we defined above
    if (err)
      return next(err);  // "next(err)" will call the error-handling middleware, which will return a 500 error to the client.
    if (!user) {
      return res.status(401).json({ error: info });  
    }
    // success: establish the login session
    req.login(user, (err) => {
      if (err)
        return next(err);

      return res.json(clientUserInfo(req));   // return the user info to the client
    });
  })(req, res, next);
});

// POST /api/login-totp
// Second authentication step: verifies the TOTP code. On success the session
// is marked as fully 2FA-authenticated and a negative score goes back to zero.
app.post('/api/login-totp', isLoggedIn,
  [check('code').isString().isLength({ min: 6, max: 6 })],  // validate that the code is a string of 6 characters
  async (req, res) => {
    const errors = validationResult(req).formatWith(errorFormatter);   // format the errors as strings
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array().join(', ') });  // if there are validation errors, return them as a 422 Unprocessable Entity response
    }
    if (!req.user.secret) {
      // same status and message as a wrong code, so the answer does not reveal whether TOTP is enabled
      return res.status(401).json({ error: 'Cannot authenticate with TOTP' });
    }
    const success = verifyTotpToken(req.user, req.body.code);
    if (success) {
      try {
        // store the last accepted step for replay protection; false means that a concurrent
        // request has just used the same code, so this one is a replay
        const stored = await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
        if (!stored)
          return res.status(401).json({ error: 'Cannot authenticate with TOTP' });
        // a negative score is restored to zero by a 2FA login
        await userDao.resetScore(req.user.id);
      } catch {
        return res.status(500).json({ error: 'Database error' });
      }
      // the session is marked as 2FA only after the DB writes succeeded
      req.session.method = 'totp';
      return res.json({ otp: 'authorized', score: 0 });  // return the new score to the client (now 0 after a successful 2FA login)
    } else {
      return res.status(401).json({ error: 'Cannot authenticate with TOTP' });
    }
  }
);

// GET /api/sessions/current
// Checks whether the user is logged in, returning its information.
app.get('/api/sessions/current', (req, res) => {
  if (req.isAuthenticated()) {
    res.status(200).json(clientUserInfo(req));
  }
  else
    res.status(401).json({ error: 'Not authenticated' });
});

// DELETE /api/sessions/current
// Logout of the current user.
app.delete('/api/sessions/current', (req, res) => {
  req.logout(() => {
    res.status(200).json({});
  });
});

// Final error handler: reached through next(err) or by errors thrown by the middlewares
// (e.g. a malformed JSON body). Without it Express answers with an HTML page containing
// the stack trace, which exposes internal details. The client always gets the usual { error } shape.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Malformed JSON body' });
  console.error(err);   // the details stay in the server log
  res.status(500).json({ error: 'Internal server error' });
});

// Activating the server
const PORT = 3001;
app.listen(PORT, (err) => {
  if (err)
    console.log(err);
  else
    console.log(`Server listening at http://localhost:${PORT}`);
});
