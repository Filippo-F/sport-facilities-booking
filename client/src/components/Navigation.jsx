import { Navbar, Nav, Badge } from 'react-bootstrap';
import { Link } from 'react-router';
import { LoginButton, LogoutButton } from './Auth.jsx';

/**
 * Top navigation bar: application name, current user info (name, score,
 * whether 2FA was completed) and login/logout buttons.
 */
function Navigation(props) {
  return (
    <Navbar bg="primary" variant="dark" className="px-3 mb-3">
      <Navbar.Brand as={Link} to="/">Sport Center</Navbar.Brand>
      <Nav className="ms-auto align-items-center">
        {props.loggedIn ?
          <>
            <Navbar.Text className="me-2">
              {props.user.name} — score: <Badge bg={props.user.score < 0 ? 'danger' : 'light'}
                text={props.user.score < 0 ? undefined : 'dark'}>{props.user.score}</Badge>
              {props.loggedInTotp ? <Badge bg="success" className="ms-2">2FA</Badge> : null}
            </Navbar.Text>
            <LogoutButton logout={props.logout} />
          </>
          : <LoginButton />}
      </Nav>
    </Navbar>
  );
}

export { Navigation };
