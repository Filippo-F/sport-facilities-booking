
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
  const user = await userDao.getUser(username, password);
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
    .then(user => callback(null, user)) // if the user is found, return it
    .catch(err => callback(err, null)); // otherwise return the error (user not found, DB error, etc.)
});

/** Creating the session */
import session from 'express-session';

app.use(session({
  secret: "s0mm3r 2026 - sp0rt c3nt3r s3cr3t",  // secret used to sign the session ID cookie
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
const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
  return `${location}[${param}]: ${msg}`;
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
      return next(err);  // "next(err)" will call the error-handling middleware, which will return a 500 error to the client"
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
      return res.status(400).json({ error: 'Cannot authenticate with TOTP' });  // if the user does not have a TOTP secret, return a 400 Bad Request response
    }
    const success = verifyTotpToken(req.user, req.body.code);
    if (success) {
      req.session.method = 'totp';
      try {
        // store the last accepted step for replay protection
        await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
        // a negative score is restored to zero by a 2FA login
        await userDao.resetScore(req.user.id);
      } catch (err) {
        return res.status(503).json({ error: 'Database error' });
      }
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

// Activating the server
const PORT = 3001;
app.listen(PORT, (err) => {
  if (err)
    console.log(err);
  else
    console.log(`Server listening at http://localhost:${PORT}`);
});
