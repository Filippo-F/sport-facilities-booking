import { useState, useEffect } from 'react';
import { Row, Col, Form, Button, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router';
import API from '../API.js';

/**
 * Reservation creation page. The facility can be chosen with two mechanisms:
 * direct selection from the list of facilities, or automatic assignment given
 * a facility type. The equipment quantities are chosen manually in both cases,
 * prefilled with the mandatory minimums of the selected facility type.
 * Users with a negative score cannot change the prefilled minimum quantities.
 */
function BookingForm(props) {
  // selection mechanism: 'direct' (specific facility) or 'automatic' (by type)
  const [mode, setMode] = useState('direct');  // default to direct selection (change to automatic if the user selects a type)
  const [facilities, setFacilities] = useState([]);
  const [facilityCode, setFacilityCode] = useState('');
  const [typeId, setTypeId] = useState('');
  // requested quantity for each equipment id of the selected type
  const [quantities, setQuantities] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [waiting, setWaiting] = useState(false);  // true while the reservation is being created, to disable the form and avoid double submissions

  const navigate = useNavigate();

  const negativeScore = props.user.score < 0;

  // load the facility list for direct selection
  useEffect(() => {
    API.getFacilities()
      .then(facilities => setFacilities(facilities))
      .catch(err => setErrorMessage(err.error));
  }, []);

  // facility type the booking refers to, in both selection modes
  const selectedTypeId = mode === 'direct' // if mode is 'direct',
    ? facilities.find(f => f.code === facilityCode)?.typeId  // get the type of the selected facility
    : (typeId ? Number(typeId) : undefined);  // otherwise, use the selected type id (undefined if typeId is empty)
  const selectedType = props.types.find(t => t.id === selectedTypeId);  

  // when the selected type changes, prefill the quantities with the mandatory
  // minimums (optional equipment starts at zero)
  useEffect(() => {
    const type = props.types.find(t => t.id === selectedTypeId);
    if (type) {
      const initial = {};
      for (const e of type.equipment)
        initial[e.id] = e.minQty;
      setQuantities(initial);   // prefill the quantities with the mandatory minimums
    } else {
      setQuantities({});  // no type selected, clear the quantities
    }
 
  // Reset the quantities only when the selected facility type changes.
  // The minimum quantities are fixed data for that type, but props.types is
  // recreated after every availability refresh, so including it here in the 
  // dependencies would incorrectly overwrite the values the user has already typed.
  }, [selectedTypeId]);  // <- dependencies

  const handleQuantity = (equipmentId, value) => {   // "equipmentId" is id of the equipment, "value" is new quantity entered by the user
    // functional form: the new state depends on the old one (so if we call setQuantities multiple times in a row, 
    // we always get the latest state since React will queue the updates and apply them in order)
    setQuantities(old => ({ ...old, [equipmentId]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setErrorMessage('');

    if (mode === 'direct' && !facilityCode) {  // If we are in direct mode and no facility is selected, show an error message and return early
      setErrorMessage('Please select a facility');
      return;
    }
    if (mode === 'automatic' && !typeId) {   // If we are in automatic mode and no type is selected, show an error message and return early
      setErrorMessage('Please select a facility type');
      return;
    }

    // client-side validation of the quantities (the server validates again)
    const equipment = [];
    for (const rule of selectedType.equipment) {
      const q = Number(quantities[rule.id]);
      if (!Number.isInteger(q) || q < 0) {
        setErrorMessage(`Invalid quantity for ${rule.name}`);
        return;
      }
      if (q < rule.minQty) {
        setErrorMessage(`At least ${rule.minQty} ${rule.name} required`);
        return;
      }
      if (q > 0)
        equipment.push({ id: rule.id, quantity: q });  // if quantity is > 0, add it to equipment list
    }

    // create the booking object and call the API to create the reservation
    setWaiting(true);
    const booking = mode === 'direct'
      ? { facilityCode: facilityCode, equipment: equipment }
      : { typeId: Number(typeId), equipment: equipment };

    props.createReservation(booking)
      .then(() => navigate('/'))  // the success message is shown by App
      .catch(err => {
        // the reservation failed: show the reason and reload the current
        // availability, so that the user can retry on up-to-date data
        setErrorMessage(err.error);
        API.getFacilities()
          .then(facilities => setFacilities(facilities))
          .catch(() => { });
        props.refreshAvailability();  // refresh the availability of the equipment for the selected type
        setWaiting(false);
      });
  };

  return (
    <Row>
      <Col md={3}></Col>
      <Col md={6}>
        <h2 className="pb-2">Book a facility</h2>
        {errorMessage ? <Alert variant='danger' dismissible onClose={() => setErrorMessage('')}>{errorMessage}</Alert> : null}
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Facility selection</Form.Label>
            <Form.Check type="radio" id="mode-direct" label="Choose a specific facility"
              checked={mode === 'direct'} onChange={() => { setMode('direct'); setTypeId(''); }} />
            <Form.Check type="radio" id="mode-automatic" label="Automatic assignment (choose only the type)"
              checked={mode === 'automatic'} onChange={() => { setMode('automatic'); setFacilityCode(''); }} />
          </Form.Group>

          {mode === 'direct' ?
            <Form.Group className="mb-3">
              <Form.Label>Facility</Form.Label>
              <Form.Select value={facilityCode} onChange={ev => setFacilityCode(ev.target.value)}>
                <option value="">Select a facility...</option>
                {facilities.map(f =>
                  <option key={f.code} value={f.code} disabled={!f.available}>
                    {f.code} — {f.type}{f.available ? '' : ' (booked)'}
                  </option>)}
              </Form.Select>
            </Form.Group>
            :
            <Form.Group className="mb-3">
              <Form.Label>Facility type</Form.Label>
              <Form.Select value={typeId} onChange={ev => setTypeId(ev.target.value)}>
                <option value="">Select a type...</option>
                {props.types.map(t =>
                  <option key={t.id} value={t.id} disabled={t.available === 0}>
                    {t.name} ({t.available} available)
                  </option>)}
              </Form.Select>
            </Form.Group>}

          {selectedType ?
            <>
              <h5>Equipment for rental</h5>
              {negativeScore ?
                <Alert variant="warning">
                  Your score is negative: only the mandatory minimum equipment can be requested.
                  You can restore your score by logging in with 2FA.
                </Alert> : null}
              {selectedType.equipment.map(rule => {
                const available = props.equipment.find(e => e.id === rule.id)?.available;
                return (
                  <Form.Group className="mb-2" key={rule.id}>
                    <Form.Label>
                      {rule.name} {rule.minQty > 0 ? `(minimum ${rule.minQty})` : '(optional)'} — available: {available}
                    </Form.Label>
                    <Form.Control type="number" min={rule.minQty} value={quantities[rule.id] ?? ''}
                      disabled={negativeScore || waiting}
                      onChange={ev => handleQuantity(rule.id, ev.target.value)} />
                  </Form.Group>
                );
              })}
            </> : null}

          <Button className="mt-3 me-2" type="submit" disabled={waiting || !selectedType}>Book</Button>
          <Button className="mt-3" variant="secondary" disabled={waiting} onClick={() => navigate('/')}>Cancel</Button>
        </Form>
      </Col>
      <Col md={3}></Col>
    </Row>
  );
}

export { BookingForm };
