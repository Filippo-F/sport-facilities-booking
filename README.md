# Exam #3: "Sport"

## React Client Application Routes

- Route `/`: page content and purpose
- Route `/something/:param`: page content and purpose, param specification
- ...

## API Server

Error responses always have the shape `{ "error": "<message>" }`. Validation errors use status 422, business rule violations use status 409 (the message explains the reason, e.g. not enough equipment, facility already booked, too early to book again), missing or invalid authentication uses 401, resources that do not exist or do not belong to the current user use 404.

### Public

- GET `/api/types`
  - Facility types with total and currently available facilities, and the equipment allowed for each type (`minQty` = 0 means optional).
  - Response: `[{ "id": 1, "name": "tennis court", "total": 3, "available": 2, "equipment": [{ "id": 1, "name": "tennis racket", "minQty": 2 }, ...] }, ...]`

- GET `/api/equipment`
  - Equipment types with total stock and currently available quantity.
  - Response: `[{ "id": 2, "name": "tennis balls", "stock": 7, "available": 3 }, ...]`

### Authentication

- POST `/api/sessions`
  - Login with username and password. The generic 401 message does not reveal which of the two is wrong.
  - Request: `{ "username": "u2@p.it", "password": "pwd" }`
  - Response: `{ "id": 2, "username": "u2@p.it", "name": "Alice", "score": -1, "canDoTotp": true, "isTotp": false }`

- POST `/api/login-totp`
  - Second authentication step: verifies a 6-digit TOTP code for the logged-in user. On success the session is marked as fully 2FA-authenticated and a negative score is reset to zero. Codes already used (same or older TOTP step) are rejected.
  - Request: `{ "code": "123456" }`
  - Response: `{ "otp": "authorized", "score": 0 }` — 401 on invalid or reused code.

- GET `/api/sessions/current`
  - Returns the current session user, 401 if no active session.
  - Response: same shape as login.

- DELETE `/api/sessions/current`
  - Logout, destroys the current session.

### Reservations (authenticated)

- GET `/api/facilities`
  - All facilities with their type and current availability, used for direct facility selection.
  - Response: `[{ "code": "T1", "typeId": 1, "type": "tennis court", "available": false }, ...]`

- GET `/api/reservations`
  - Reservations of the current user (taken from the session, never from the request), each with its rented equipment.
  - Response: `[{ "id": 2, "facilityCode": "T1", "typeId": 1, "type": "tennis court", "equipment": [{ "id": 1, "name": "tennis racket", "quantity": 3 }, ...] }, ...]`

- POST `/api/reservations`
  - Creates a reservation in a single request. Exactly one of `facilityCode` (direct selection) or `typeId` (automatic assignment of a free facility of that type) must be provided. `equipment` lists the total requested quantities and must include every mandatory equipment of the facility type at least at its minimum; users with a negative score can only request the exact mandatory minimums. The request fails if the facility (or the whole type) is not available, if any equipment quantity exceeds the current availability, or if the user deleted a reservation of the same facility type less than 30 seconds ago.
  - Request: `{ "facilityCode": "T2", "equipment": [{ "id": 1, "quantity": 2 }, { "id": 2, "quantity": 3 }] }` or `{ "typeId": 5, "equipment": [...] }`
  - Response: `201` with the created reservation, same shape as GET `/api/reservations` items.

- PUT `/api/reservations/:id`
  - Replaces the equipment of one of the current user's reservations with the provided list (add and/or remove in one request). Mandatory minimums can never be removed; quantity increases are checked against current availability; users with a negative score can only remove equipment (no new items, no quantity increases with respect to the current reservation).
  - Request: `{ "equipment": [{ "id": 1, "quantity": 4 }, { "id": 2, "quantity": 3 }] }`
  - Response: `200` with the updated reservation.

- DELETE `/api/reservations/:id`
  - Deletes one of the current user's reservations, restoring facility and equipment availability. The user's score is decreased by 1 and the deletion time is recorded to enforce the 30-second rule on that facility type.
  - Response: `200` with empty body.


## Database Tables

- Table `users` - contains xx yy zz
- Table `something` - contains ww qq ss
- ...

## Main React Components

- `ListOfSomething` (in `List.js`): component purpose and main functionality
- `GreatButton` (in `GreatButton.js`): component purpose and main functionality
- ...

(only _main_ components, minor ones may be skipped)

## Screenshot

![Screenshot](./img/screenshot.png)

## Users Credentials

- username, password (plus any other requested info which depends on the text)
- username, password (plus any other requested info which depends on the text)

