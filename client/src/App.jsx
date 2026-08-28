import 'bootstrap/dist/css/bootstrap.min.css';  // Bootstrap CSS is imported here so that it is available in all components.
import './App.css';

import { useState, useEffect } from 'react';
import { Container } from 'react-bootstrap';
import { Routes, Route, Navigate, useNavigate } from 'react-router';

import { GenericLayout, HomeLayout, NotFoundLayout } from './components/Layout.jsx';
import { LoginForm, TotpForm } from './components/Auth.jsx';
import API from './API.js';

function App() {
  const navigate = useNavigate();  // Used to navigate into different pages

  // Authentication state: whether the user is logged in, their info, and
  // whether the second authentication step (TOTP) has been completed.
  const [loggedIn, setLoggedIn] = useState(false);  // "loggedIn" actual value, "setLoggedIn" is the function to change it, "false" is the initial value
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
    if (err.error)   // the server returned an error in the shape { error: <message> }
      msg = err.error;
    else if (typeof err === 'string')   // the server returned a string error message
      msg = err;
    else
      msg = 'Unknown error';
    setMessage(msg);
  };

  // Reloads the public availability data (facility types and equipment).
  const loadAvailability = () => {
    Promise.all([API.getTypes(), API.getEquipment()])  // "all" waits for both promises to complete
      .then(([types, equipment]) => {
        setTypes(types);
        setEquipment(equipment);
      })
      .catch(err => handleErrors(err));
  };

  // At mount time: check whether the user is already logged in (e.g. after a
  // page reload) and load the public availability data.
  // "useEffect" is a React hook that runs the given function after the component has been rendered (visualized).
  useEffect(() => {
    const checkAuth = async () => {   // this function is async because it uses "await" to wait for the API call to complete
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
      navigate('/');  // go back to the home page after logout
    }
  };

  // We return a JSX tree that defines the structure of the app. The <Routes> component defines 
  // the different pages of the app, and the <Route> components define which component should be rendered
  // for each path. The "element" prop of each <Route> specifies the component to render, 
  // and we pass down the necessary props to each component.
  return (
    <Container fluid>
      <Routes>
        <Route path="/" element={<GenericLayout user={user} loggedIn={loggedIn} loggedInTotp={loggedInTotp}  // "GenericLayout" is the main layout of the app.
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
    if (props.user.canDoTotp && !props.loggedInTotp) {  // if the user can do TOTP but has not yet completed the second step, show the TOTP form
      return <TotpForm totpSuccessful={props.totpSuccessful} setLoggedIn={props.setLoggedIn} />;
    } else {
      return <Navigate replace to='/' />;
    }
  } else {
    return <LoginForm login={props.login} />;
  }
}

export default App;
