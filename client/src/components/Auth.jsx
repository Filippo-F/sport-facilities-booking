import { useState } from 'react';
import { Form, Button, Alert, Col, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router';
import API from '../API.js';

/**
 * Login form (first authentication screen), controlled component.
 */
function LoginForm(props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [waiting, setWaiting] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setErrorMessage('');

    if (!username) {
      setErrorMessage('Username cannot be empty');
    } else if (!password) {
      setErrorMessage('Password cannot be empty');
    } else {
      setWaiting(true);
      props.login({ username, password })
        // on success, navigation towards the TOTP screen or the home page is
        // handled automatically by the router
        .catch(err => {
          setErrorMessage(err.error);
          setWaiting(false);
        });
    }
  };

  return (
    <Row>
      <Col xs={4}></Col>
      <Col xs={4}>
        <h1 className="pb-3">Login</h1>
        <Form onSubmit={handleSubmit}>
          {errorMessage ? <Alert dismissible onClose={() => setErrorMessage('')} variant="danger">{errorMessage}</Alert> : null}
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control type="email" value={username} placeholder="Example: u1@p.it"
              onChange={(ev) => setUsername(ev.target.value)} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Password</Form.Label>
            <Form.Control type="password" value={password} placeholder="Enter your password"
              onChange={(ev) => setPassword(ev.target.value)} />
          </Form.Group>
          <Button className="mt-3" type="submit" disabled={waiting}>Login</Button>
        </Form>
      </Col>
      <Col xs={4}></Col>
    </Row>
  );
}

/**
 * TOTP form (second authentication screen, on a separate page after the
 * username/password verification). The step is optional and can be skipped.
 */
function TotpForm(props) {
  const [totpCode, setTotpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [waiting, setWaiting] = useState(false);

  const navigate = useNavigate();

  const doTotpVerify = () => {
    setWaiting(true);
    API.totpVerify(totpCode)
      .then(() => {
        setErrorMessage('');
        props.totpSuccessful();
        navigate('/');
      })
      .catch(() => {
        // a generic message is shown, without revealing details
        setErrorMessage('Wrong code, please try again');
        setWaiting(false);
      });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setErrorMessage('');

    if (totpCode.length === 6)
      doTotpVerify();
    else
      setErrorMessage('The code must be 6 digits long');
  };

  return (
    <Row>
      <Col xs={4}></Col>
      <Col xs={4}>
        <h2 className="pt-3">Second Factor Authentication</h2>
        <h5>Please enter the code that you read on your device</h5>
        <p>Completing this step will also restore a negative score to zero. You can skip it to continue with password-only authentication.</p>
        <Form onSubmit={handleSubmit}>
          {errorMessage ? <Alert variant='danger' dismissible onClose={() => setErrorMessage('')}>{errorMessage}</Alert> : null}
          <Form.Group controlId='totpCode' className="mb-3">
            <Form.Label>Code</Form.Label>
            <Form.Control type='text' value={totpCode} onChange={ev => setTotpCode(ev.target.value)} />
          </Form.Group>
          <Button className='my-2' type='submit' disabled={waiting}>Validate</Button>
          <Button className='my-2 mx-2' variant='secondary' disabled={waiting} onClick={() => navigate('/')}>Skip</Button>
        </Form>
      </Col>
      <Col xs={4}></Col>
    </Row>
  );
}

function LoginButton() {
  const navigate = useNavigate();
  return <Button variant="outline-light" onClick={() => navigate('/login')}>Login</Button>;
}

function LogoutButton(props) {
  return <Button variant="outline-light" onClick={props.logout}>Logout</Button>;
}

export { LoginForm, TotpForm, LoginButton, LogoutButton };
