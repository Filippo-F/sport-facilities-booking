import { Row, Col, Alert, Button } from 'react-bootstrap';
import { Outlet, Link } from 'react-router';

import { Navigation } from './Navigation.jsx';
import { Home } from './Home.jsx';

/**
 * Common layout: navigation bar on top, then an alert with the last error
 * message (if any), then the content of the current route.
 */
function GenericLayout(props) {
  return (
    <>
      <Row>
        <Col>
          <Navigation user={props.user} loggedIn={props.loggedIn}
            loggedInTotp={props.loggedInTotp} logout={props.logout} />
        </Col>
      </Row>
      {props.message ?
        <Row>
          <Col>
            <Alert className='my-1' onClose={() => props.setMessage('')} variant='danger' dismissible>
              {props.message}
            </Alert>
          </Col>
        </Row> : null}
      <Outlet />
    </>
  );
}

function HomeLayout(props) {
  return <Home types={props.types} equipment={props.equipment} loggedIn={props.loggedIn} />;
}

function NotFoundLayout() {
  return (
    <>
      <Row>
        <Col>
          <h2>This page does not exist</h2>
          <Link to="/">
            <Button variant="primary">Go back to the main page</Button>
          </Link>
        </Col>
      </Row>
    </>
  );
}

export { GenericLayout, HomeLayout, NotFoundLayout };
