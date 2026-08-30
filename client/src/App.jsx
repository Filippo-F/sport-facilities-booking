import 'bootstrap/dist/css/bootstrap.min.css';  // Bootstrap CSS is imported here so that it is available in all components.
import 'bootstrap-icons/font/bootstrap-icons.css';  // icon font used on the action buttons
import './App.css';

import { useState, useEffect } from 'react';
import { Container } from 'react-bootstrap';
import { Routes, Route, Navigate, useNavigate } from 'react-router';

import { GenericLayout, HomeLayout, BookingLayout, ReservationsLayout, EditReservationLayout, NotFoundLayout } from './components/Layout.jsx';
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

  // Reservations of the logged-in user.
  const [reservations, setReservations] = useState([]);

  // True while the corresponding data is being fetched, so that the pages can
  // show a spinner instead of rendering an empty (and therefore wrong) list.
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(true);

  // Last message to be shown to the user: { text, variant } or null.
  const [message, setMessage] = useState(null);

  // Extracts a readable message from an API error and shows it.
  const handleErrors = (err) => {
    let msg = '';
    if (err.error)   // the server returned an error in the shape { error: <message> }
      msg = err.error;
    else if (typeof err === 'string')   // the server returned a string error message
      msg = err;
    else
      msg = 'Unknown error';
    setMessage({ text: msg, variant: 'danger' });  // "danger" is a Bootstrap class that makes the message red
  };

  // Reloads the public availability data (facility types and equipment).
  const loadAvailability = () => {
    setLoadingAvailability(true);
    Promise.all([API.getTypes(), API.getEquipment()])  // "all" waits for both promises to complete
      .then(([types, equipment]) => {
        setTypes(types);
        setEquipment(equipment);
      })
      .catch(err => handleErrors(err))
      // "finally" runs on success and on failure as well: on error the page must
      // show the error message, not stay on the spinner forever
      .finally(() => setLoadingAvailability(false));
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
      } catch {
        // the user is simply not authenticated: nothing to do
      }
    };
    checkAuth();
    loadAvailability();
  }, []);  // empty dependency list: this must run once, when the component is mounted

  // Reloads the reservations of the current user.
  const loadReservations = () => {
    setLoadingReservations(true);
    API.getReservations()
      .then(reservations => setReservations(reservations))
      .catch(err => handleErrors(err))
      .finally(() => setLoadingReservations(false));
  };

  // Whenever the user logs in (or is found already logged in), their
  // reservations are loaded; they are cleared at logout.
  useEffect(() => {
    if (loggedIn)
      loadReservations();
    else {
      setReservations([]);
      setLoadingReservations(false);
    }
  // only loggedIn is a dependency: the effect must react to the login state, not to
  // the identity of loadReservations, which is recreated at every render
  }, [loggedIn]);

  // Login with username and password. On failure the error is thrown, so that
  // the login form can show it.
  const handleLogin = async (credentials) => {
    const user = await API.logIn(credentials);
    setUser(user);
    setLoggedIn(true);
  };

  // Creates a reservation and, on success, refreshes the availability shown
  // in all the views and shows a confirmation message. Errors are thrown, so
  // that the booking form can show the reason and let the user retry.
  const handleCreateReservation = async (booking) => {
    const created = await API.createReservation(booking);
    loadAvailability();
    loadReservations();
    setMessage({ text: `Reservation confirmed: facility ${created.facilityCode}`, variant: 'success' });
    return created;
  };

  // Replaces the equipment of a reservation. 
  // The views are refreshed in any case, so that a failure also realigns the application with 
  // the current state of the server. The error is propagated to the edit form, which shows the reason.
  const handleUpdateReservation = async (reservationId, equipment) => {
    try {
      const updated = await API.updateReservation(reservationId, equipment);
      setMessage({ text: `Reservation for facility ${updated.facilityCode} updated`, variant: 'success' });
      return updated;
    } finally {
      loadAvailability();
      loadReservations();
    }
  };

  // Deletes a reservation. The score changes, so the user info is reloaded
  // together with the reservations and the availability. If the operation
  // fails (e.g. the reservation does not exist anymore), the error is shown
  // and the data is reloaded anyway, to realign the views with the server.
  const handleDeleteReservation = async (reservationId) => {
    try {
      await API.deleteReservation(reservationId);
      setMessage({ text: 'Reservation deleted', variant: 'success' });
    } catch (err) {
      handleErrors(err);
      throw err;
    } finally {  // This part is executed in any case, whether the deletion succeeded or failed. 
    // It is used to refresh the data and keep the views in sync with the server.
      loadAvailability();
      loadReservations();
      API.getUserInfo()
        .then(user => setUser(user))
        .catch(() => { });
    }
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
    } catch {
      // nothing more can be done if the logout fails
    } finally {
      // clean up all the user-related state
      setLoggedIn(false);
      setLoggedInTotp(false);
      setUser(null);
      setMessage(null);
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
          <Route index element={<HomeLayout types={types} equipment={equipment} loggedIn={loggedIn}
            loading={loadingAvailability} />} />
          <Route path="reservations" element={loggedIn ?
            <ReservationsLayout reservations={reservations} deleteReservation={handleDeleteReservation}
              loading={loadingReservations} />
            : <Navigate replace to='/login' />} />
          <Route path="reservations/:id/edit" element={loggedIn ?
            <EditReservationLayout user={user} types={types} equipment={equipment} reservations={reservations}
              updateReservation={handleUpdateReservation} refreshAvailability={loadAvailability} />
            : <Navigate replace to='/login' />} />
          <Route path="book" element={loggedIn ?
            <BookingLayout user={user} types={types} equipment={equipment}
              createReservation={handleCreateReservation} refreshAvailability={loadAvailability} />
            : <Navigate replace to='/login' />} />
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
