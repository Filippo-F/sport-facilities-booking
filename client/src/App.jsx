import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

import { useState, useEffect } from 'react';
import { Container } from 'react-bootstrap';
import { Routes, Route, Navigate, useNavigate } from 'react-router';

import { GenericLayout, HomeLayout, NotFoundLayout } from './components/Layout.jsx';
import { LoginForm, TotpForm } from './components/Auth.jsx';
import API from './API.js';

function App() {
  const navigate = useNavigate();

  // Authentication state: whether the user is logged in, their info, and
  // whether the second authentication step (TOTP) has been completed.
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [loggedInTotp, setLoggedInTotp] = useState(false);

  // Availability data shown on the first page (public).
  const [types, setTypes] = useState([]);
  const [equipment, setEquipment] = useState([]);

  // Last error message to be shown to the user.
  const [message, setMessage] = useState('');

  // Extracts a readable message from an API error and shows it.
  const handleErrors = (err) => {
    let msg = '';
    if (err.error)
      msg = err.error;
    else if (typeof err === 'string')
      msg = err;
    else
      msg = 'Unknown error';
    setMessage(msg);
  };

  // Reloads the public availability data (facility types and equipment).
  const loadAvailability = () => {
    Promise.all([API.getTypes(), API.getEquipment()])
      .then(([types, equipment]) => {
        setTypes(types);
        setEquipment(equipment);
      })
      .catch(err => handleErrors(err));
  };

  // At mount time: check whether the user is already logged in (e.g. after a
  // page reload) and load the public availability data.
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await API.getUserInfo();
        setLoggedIn(true);
        setUser(user);
        if (user.isTotp)
          setLoggedInTotp(true);
      } catch (err) {
        // the user is simply not authenticated: nothing to do
      }
    };
    checkAuth();
    loadAvailability();
  }, []);

  // Login with username and password. On failure the error is thrown, so that
  // the login form can show it.
  const handleLogin = async (credentials) => {
    const user = await API.logIn(credentials);
    setUser(user);
    setLoggedIn(true);
  };

  // Called after a successful TOTP verification: the user info is reloaded
  // since a negative score has been reset by the server.
  const totpSuccessful = () => {
    setLoggedInTotp(true);
    API.getUserInfo()
      .then(user => setUser(user))
      .catch(err => handleErrors(err));
  };

  const handleLogout = async () => {
    try {
      await API.logOut();
    } catch (err) {
      // nothing more can be done if the logout fails
    } finally {
      // clean up all the user-related state
      setLoggedIn(false);
      setLoggedInTotp(false);
      setUser(null);
      setMessage('');
      navigate('/');
    }
  };

  return (
    <Container fluid>
      <Routes>
        <Route path="/" element={<GenericLayout user={user} loggedIn={loggedIn} loggedInTotp={loggedInTotp}
          logout={handleLogout} message={message} setMessage={setMessage} />}>
          <Route index element={<HomeLayout types={types} equipment={equipment} loggedIn={loggedIn} />} />
          <Route path="*" element={<NotFoundLayout />} />
        </Route>
        <Route path="/login" element={<LoginWithTotp loggedIn={loggedIn} login={handleLogin} user={user}
          loggedInTotp={loggedInTotp} totpSuccessful={totpSuccessful} setLoggedIn={setLoggedIn} />} />
      </Routes>
    </Container>
  );
}

/**
 * Component for the /login route: shows the login form, then the TOTP form as
 * a separate second screen after a successful username/password verification.
 * The TOTP step can be skipped, since 2FA is optional at login.
 */
function LoginWithTotp(props) {
  if (props.loggedIn) {
    if (props.user.canDoTotp && !props.loggedInTotp) {
      return <TotpForm totpSuccessful={props.totpSuccessful} setLoggedIn={props.setLoggedIn} />;
    } else {
      return <Navigate replace to='/' />;
    }
  } else {
    return <LoginForm login={props.login} />;
  }
}

export default App;
