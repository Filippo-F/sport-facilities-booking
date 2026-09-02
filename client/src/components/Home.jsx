import { Row, Col, Card, Button, ProgressBar, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router';

/**
 * First page, visible to anybody: number of available facilities for each
 * type and currently available quantity for each equipment type.
 */
function Home(props) {
  const navigate = useNavigate();

  // Totals shown in the heading. They are derived from the data received from
  // the server, so they are computed while rendering and never stored.
  const freeFacilities = props.types.reduce((sum, t) => sum + t.available, 0);  // "reduce" used to sum the available facilities across all types
  const totalFacilities = props.types.reduce((sum, t) => sum + t.total, 0);

  return (
    <>
      <Row className="page-head">
        <Col md={7}>
          <h1>Book a facility, equipment included</h1>
          <p>Every reservation comes with the equipment the facility requires.
            The numbers below are the availability right now.</p>
          {props.loggedIn ?
            <Button className="mt-3" onClick={() => navigate('/book')}>
              <i className="bi bi-plus-lg me-1" />Book a facility
            </Button>
            : <p className="mt-3 mb-0"><i>Log in to book a facility.</i></p>}
        </Col>
        <Col md={5} className="d-flex gap-4 justify-content-md-end align-items-start mt-4 mt-md-0">
          {/* the totals are hidden while loading: showing 0 would be not right */}
          {props.loading ? null :
            <>
              <div className="d-flex flex-column">
                <span className="figure-free">{freeFacilities}</span>
                <span className="section-label mb-0">free now</span>
              </div>
              <div className="d-flex flex-column">
                <span className="figure-free">{totalFacilities}</span>
                <span className="section-label mb-0">facilities</span>
              </div>
            </>}
        </Col>
      </Row>

      {props.loading ? <Spinner /> : <>

      <div className="section-label">Facilities</div>
      <Row xs={1} md={2} lg={3} className="g-3 mb-4">
        {props.types.map(t => {
          // No available facilities at all, or a single facility left when the type has
          // more than one: the two cases are shown with different colours
          const full = t.available === 0;
          const low = !full && t.available === 1 && t.total > 1;
          return (
            <Col key={t.id}>
              <Card className={'facility-card h-100' + (full ? ' full' : low ? ' low' : '')}>
                <Card.Body className="d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <Card.Title>{t.name}</Card.Title>
                    <div className="text-end">
                      <span className="figure-free">{t.available}</span>
                      <span className="figure-total">/{t.total}</span>
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    {t.equipment.map(e =>
                      <span key={e.id} className={e.minQty > 0 ? 'kit-tag' : 'kit-tag optional'}>
                        {e.name}{e.minQty > 0 ? <span className="qty"> &times;{e.minQty}</span> : null}
                      </span>)}
                  </div>
                  {full ? <div className="card-status">Fully booked</div>
                    : low ? <div className="card-status">Last one free</div> : null}
                </Card.Body>
              </Card>
            </Col>);
        })}
      </Row>

      <div className="section-label">Equipment for rental</div>
      <Row xs={1} md={2} lg={3} className="gx-5">
        {props.equipment.map(e => {
          // the threshold is a proportion of the stock, not a fixed number: an
          // item that exists in a single copy and is free is not running out
          const empty = e.available === 0;
          const low = !empty && (e.available === 1 && e.stock > 1 || e.available <= e.stock / 3);
          return (
          <Col key={e.id}>
            <div className={'kit-row' + (empty ? ' empty' : low ? ' low' : '')}>
              <div className="d-flex justify-content-between align-items-baseline gap-2">
                <span>{e.name}</span>
                <span className="kit-qty"><span className="left">{e.available}</span>/{e.stock}</span>
              </div>
              <ProgressBar now={e.available} max={e.stock} className="mt-1" />
            </div>
          </Col>);
        })}
      </Row>

      </>}
    </>
  );
}

export { Home };
