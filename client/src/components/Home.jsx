import { Row, Col, Table, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router';

/**
 * First page, visible to anybody: number of available facilities for each
 * type and currently available quantity for each equipment type.
 */
function Home(props) {
  const navigate = useNavigate();

  return (
    <>
      <Row className="mb-3">
        <Col>
          <h1>Sport Center</h1>
          <p>Current availability of facilities and equipment for rental.</p>
          {props.loggedIn ?
            <Button onClick={() => navigate('/book')}>Book a facility</Button>
            : <p><i>Login to book a facility.</i></p>}
        </Col>
      </Row>
      <Row>
        <Col md={6}>
          <h4>Facilities</h4>
          <Table striped>
            <thead>
              <tr><th>Facility type</th><th>Available</th><th>Equipment for this facility (min. quantity)</th></tr>
            </thead>
            <tbody>
              {props.types.map(t =>
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.available} / {t.total}</td>
                  <td>{t.equipment.map(e => e.minQty > 0 ? `${e.name} (${e.minQty})` : `${e.name} (optional)`).join(', ')}</td>
                </tr>)}
            </tbody>
          </Table>
        </Col>
        <Col md={6}>
          <h4>Equipment for rental</h4>
          <Table striped>
            <thead>
              <tr><th>Equipment</th><th>Available</th></tr>
            </thead>
            <tbody>
              {props.equipment.map(e =>
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.available} / {e.stock}</td>
                </tr>)}
            </tbody>
          </Table>
        </Col>
      </Row>
    </>
  );
}

export { Home };
