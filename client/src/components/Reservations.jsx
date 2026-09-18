import { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Alert, Form, Spinner } from 'react-bootstrap';
import { useNavigate, useParams, Link } from 'react-router';

/**
 * List of the reservations of the current user, with their equipment and the
 * buttons to modify the equipment or delete the reservation.
 */
function Reservations(props) {
  // id of the reservation whose deletion is waiting to be confirmed, if any
  const [confirmingId, setConfirmingId] = useState(null);
  // true while a deletion is in progress: all the buttons are disabled
  const [waiting, setWaiting] = useState(false);

  const navigate = useNavigate();

  const handleDelete = (id) => {
    setWaiting(true);
    props.deleteReservation(id)
      .catch(() => { /* the error message is shown by App */ })  // The error is not managed here since it is already handled in the App component, which shows the error message.
      .finally(() => {
        setConfirmingId(null);
        setWaiting(false);
      });
  };

  return (
    <Row>
      <Col>
        <div className="page-head">
          <h1>My reservations</h1>
          <p>Deleting a reservation frees the facility and its equipment, and reduces your score by one.</p>
        </div>

        {/* while the list is being loaded the empty message won't be shown:
            a user with reservations would read that they have none */}
        {props.loading ? <Spinner /> :
          props.reservations.length === 0 ?
            <p>You have no reservations. <Link to="/book">Book a facility</Link>.</p>
            :
            <Table className="align-middle">
              <thead>
                <tr><th>Facility</th><th>Type</th><th>Equipment</th><th></th></tr>
              </thead>
              <tbody>
                {props.reservations.map(r =>
                  <tr key={r.id}>
                    <td><span className="code">{r.facilityCode}</span></td>
                    <td>{r.type}</td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {r.equipment.map(e =>
                          <span key={e.id} className="kit-tag">
                            {e.name}<span className="qty"> &times;{e.quantity}</span>
                          </span>)}
                      </div>
                    </td>
                    <td className="text-end">
                      {confirmingId === r.id ?
                        <>
                          <Button variant="danger" size="sm" className="me-2" disabled={waiting}
                            onClick={() => handleDelete(r.id)}><i className="bi bi-trash me-1" />Confirm delete</Button>
                          <Button variant="secondary" size="sm" disabled={waiting}
                            onClick={() => setConfirmingId(null)}>Cancel</Button>
                        </>
                        :
                        <>
                          <Button variant="outline-primary" size="sm" className="me-2" disabled={waiting}
                            onClick={() => navigate(`/reservations/${r.id}/edit`)}><i className="bi bi-pencil me-1" />Edit equipment</Button>
                          <Button variant="outline-danger" size="sm" disabled={waiting}
                            onClick={() => setConfirmingId(r.id)}><i className="bi bi-trash me-1" />Delete</Button>
                        </>}
                    </td>
                  </tr>)}
              </tbody>
            </Table>}
      </Col>
    </Row>
  );
}

/**
 * Page for modifying the equipment of an existing reservation: quantities can
 * be added or removed (never below the mandatory minimums). Users with a
 * negative score can only remove equipment with respect to the current state.
 */
function EditReservation(props) {
  const { id } = useParams();  // "useParams" is used to get the reservation ID from the URL parameters
  const reservation = props.reservations.find(r => r.id === Number(id));
  const type = reservation ? props.types.find(t => t.id === reservation.typeId) : undefined;

  const [quantities, setQuantities] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [waiting, setWaiting] = useState(false);

  const navigate = useNavigate();

  const negativeScore = props.user.score < 0;

  // prefill the quantities with the current equipment of the reservation
  useEffect(() => {
    if (reservation && type) {
      const initial = {};
      for (const rule of type.equipment) {
        const current = reservation.equipment.find(e => e.id === rule.id);
        initial[rule.id] = current ? current.quantity : 0;
      }
      setQuantities(initial);
    }
    // the reservation content only changes through this same page, so the
    // dependency on its id is enough
  }, [reservation?.id]);

  if (!reservation || !type) {
    return (
      <Row>
        <Col>
          <p>Reservation not found.</p>
          <Link to="/reservations"><Button>Back to my reservations</Button></Link>
        </Col>
      </Row>
    );
  }

  const currentQty = (equipmentId) => {
    const current = reservation.equipment.find(e => e.id === equipmentId);
    return current ? current.quantity : 0;
  };

  const handleQuantity = (equipmentId, value) => {
    setQuantities(old => ({ ...old, [equipmentId]: value }));  // update the quantity for the given equipment ID
  };

  // The most that can be kept is what the reservation already has plus what is still available
  // (with a negative score nothing can be added). The server checks it again.
  const maxQty = (rule) => {
    if (negativeScore)
      return currentQty(rule.id);
    return currentQty(rule.id) + (props.equipment.find(e => e.id === rule.id)?.available ?? 0);
  };

  const handleSubmit = (event) => {
    event.preventDefault();  // prevent the default form submission behavior (which would reload the page)
    setErrorMessage('');

    const equipment = [];
    for (const rule of type.equipment) {
      const q = Number(quantities[rule.id]);
      if (!Number.isInteger(q) || q < 0) {
        setErrorMessage(`Invalid quantity for ${rule.name}`);
        return;
      }
      if (q < rule.minQty) {
        setErrorMessage(`At least ${rule.minQty} ${rule.name} required`);
        return;
      }
      if (negativeScore && q > currentQty(rule.id)) {
        setErrorMessage('With a negative score equipment can only be removed, not added');
        return;
      }
      if (q > maxQty(rule)) {
        setErrorMessage(`At most ${maxQty(rule)} ${rule.name} for this reservation`);
        return;
      }
      if (q > 0)
        equipment.push({ id: rule.id, quantity: q });  // update the equipment list
    }

    setWaiting(true);
    props.updateReservation(reservation.id, equipment)
      .then(() => navigate('/reservations'))  // the success message is shown by App
      .catch(err => {
        // the update failed: show the reason and reload up-to-date data,
        // so that the user can retry
        setErrorMessage(err.error);
        props.refreshAvailability();
        setWaiting(false);
      });
  };

  return (
    <Row>
      <Col md={3}></Col>
      <Col md={6}>
        <div className="page-head">
          <h1>Edit equipment</h1>
          <p><span className="code">{reservation.facilityCode}</span> — {reservation.type}</p>
        </div>
        {errorMessage ? <Alert variant='danger' dismissible onClose={() => setErrorMessage('')}>{errorMessage}</Alert> : null}
        {negativeScore ?
          <Alert variant="warning">
            Your score is negative: equipment can only be removed, not added.
            You can restore your score by logging in with 2FA.
          </Alert> : null}
        <Form onSubmit={handleSubmit}>
          {type.equipment.map(rule => {
            const available = props.equipment.find(e => e.id === rule.id)?.available;
            return (
              <Form.Group className="mb-3" key={rule.id}>
                <Form.Label>
                  {rule.name} {rule.minQty > 0 ? `(minimum ${rule.minQty})` : '(optional)'} — currently {currentQty(rule.id)}, other {available} available
                </Form.Label>
                <Form.Control type="number" min={rule.minQty}
                  max={maxQty(rule)}
                  value={quantities[rule.id] ?? ''}
                  disabled={waiting || (negativeScore && currentQty(rule.id) === rule.minQty)}
                  onChange={ev => handleQuantity(rule.id, ev.target.value)} />
              </Form.Group>
            );
          })}
          <Button className="mt-3 me-2" type="submit" disabled={waiting}>Save</Button>
          <Button className="mt-3" variant="secondary" disabled={waiting} onClick={() => navigate('/reservations')}>Cancel</Button>
        </Form>
      </Col>
      <Col md={3}></Col>
    </Row>
  );
}

export { Reservations, EditReservation };
