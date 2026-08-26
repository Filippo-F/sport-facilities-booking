BEGIN TRANSACTION;

-- Registered users.

-- Passwords are stored as scrypt hashes with a per-user salt.
-- Each user has its own TOTP "secret" stored in the DB (here the same value for testing purposes). 
-- lastTotpStep tracks the last accepted TOTP step to prevent code reuse. 
-- score is an integer <= 0, decreased on each eservation deletion.
CREATE TABLE IF NOT EXISTS "users" (
	"id"	INTEGER NOT NULL,
	"email"	TEXT NOT NULL UNIQUE,
	"name"	TEXT,
	"hash"	TEXT NOT NULL,
	"salt"	TEXT NOT NULL,
	"secret"	TEXT,
	"lastTotpStep"	INTEGER NOT NULL DEFAULT 0,
	"score"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id" AUTOINCREMENT)
);

-- Facility categories (tennis court, basketball court, ...).
CREATE TABLE IF NOT EXISTS "facilityTypes" (
	"id"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("id" AUTOINCREMENT)
);

-- Physical facilities (identified by a short unique code like T1, B2, ...) with foraign key to the facility type.
CREATE TABLE IF NOT EXISTS "facilities" (
	"code"	TEXT NOT NULL,
	"typeId"	INTEGER NOT NULL,
	PRIMARY KEY("code"),
	FOREIGN KEY("typeId") REFERENCES "facilityTypes"("id")
);

-- Equipment types with the total stock owned by the sport center.
CREATE TABLE IF NOT EXISTS "equipmentTypes" (
	"id"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL UNIQUE,
	"stock"	INTEGER NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);

-- Equipment allowed for each facility type.
-- minQty > 0: mandatory equipment with its minimum quantity.
-- minQty = 0: optional equipment.
CREATE TABLE IF NOT EXISTS "typeEquipment" (
	"facilityTypeId"	INTEGER NOT NULL,
	"equipmentTypeId"	INTEGER NOT NULL,
	"minQty"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("facilityTypeId","equipmentTypeId"),
	FOREIGN KEY("facilityTypeId") REFERENCES "facilityTypes"("id"),
	FOREIGN KEY("equipmentTypeId") REFERENCES "equipmentTypes"("id")
);

-- Active reservations: one row per booked facility.
-- The UNIQUE constraint on facilityCode guarantees at the DB level that a
-- facility cannot be booked twice at the same time.
CREATE TABLE IF NOT EXISTS "reservations" (
	"id"	INTEGER NOT NULL,
	"userId"	INTEGER NOT NULL,
	"facilityCode"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("userId") REFERENCES "users"("id"),
	FOREIGN KEY("facilityCode") REFERENCES "facilities"("code")
);

-- Equipment rented within each reservation. quantity is the total requested
-- amount (mandatory minimum included) and is always > 0.
CREATE TABLE IF NOT EXISTS "reservationEquipment" (
	"reservationId"	INTEGER NOT NULL,
	"equipmentTypeId"	INTEGER NOT NULL,
	"quantity"	INTEGER NOT NULL,
	PRIMARY KEY("reservationId","equipmentTypeId"),
	FOREIGN KEY("reservationId") REFERENCES "reservations"("id"),
	FOREIGN KEY("equipmentTypeId") REFERENCES "equipmentTypes"("id")
);

-- Keep track of the last time a user deleted a reservation for a given facility type. 
-- Used to block a new booking of the same facility type within 30 seconds. 
-- There exists only one row per (user, type) pair and is updated on every deletion.
CREATE TABLE IF NOT EXISTS "releases" (
	"userId"	INTEGER NOT NULL,
	"facilityTypeId"	INTEGER NOT NULL,
	"releasedAt"	INTEGER NOT NULL,
	PRIMARY KEY("userId","facilityTypeId"),
	FOREIGN KEY("userId") REFERENCES "users"("id"),
	FOREIGN KEY("facilityTypeId") REFERENCES "facilityTypes"("id")
);

-- Facility types
INSERT INTO "facilityTypes" ("id","name") VALUES (1,'tennis court');
INSERT INTO "facilityTypes" ("id","name") VALUES (2,'basketball court');
INSERT INTO "facilityTypes" ("id","name") VALUES (3,'volleyball court');
INSERT INTO "facilityTypes" ("id","name") VALUES (4,'soccer field');
INSERT INTO "facilityTypes" ("id","name") VALUES (5,'table tennis table');
INSERT INTO "facilityTypes" ("id","name") VALUES (6,'cycling track');

-- Facilities: 3 tennis, 2 basketball, 2 volleyball, 1 soccer, 4 table tennis, 2 cycling
INSERT INTO "facilities" ("code","typeId") VALUES ('T1',1);
INSERT INTO "facilities" ("code","typeId") VALUES ('T2',1);
INSERT INTO "facilities" ("code","typeId") VALUES ('T3',1);
INSERT INTO "facilities" ("code","typeId") VALUES ('B1',2);
INSERT INTO "facilities" ("code","typeId") VALUES ('B2',2);
INSERT INTO "facilities" ("code","typeId") VALUES ('V1',3);
INSERT INTO "facilities" ("code","typeId") VALUES ('V2',3);
INSERT INTO "facilities" ("code","typeId") VALUES ('S1',4);
INSERT INTO "facilities" ("code","typeId") VALUES ('TT1',5);
INSERT INTO "facilities" ("code","typeId") VALUES ('TT2',5);
INSERT INTO "facilities" ("code","typeId") VALUES ('TT3',5);
INSERT INTO "facilities" ("code","typeId") VALUES ('TT4',5);
INSERT INTO "facilities" ("code","typeId") VALUES ('C1',6);
INSERT INTO "facilities" ("code","typeId") VALUES ('C2',6);

-- Equipment types with total stock
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (1,'tennis racket',8);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (2,'tennis balls',7);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (3,'towel',4);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (4,'basketball',2);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (5,'cones',4);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (6,'volleyball',2);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (7,'pair of knee pads',10);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (8,'soccer ball',2);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (9,'pair of soccer shoes',12);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (10,'pair of goalkeeper gloves',2);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (11,'table tennis racket',8);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (12,'table tennis balls',4);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (13,'bicycle',4);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (14,'helmet',4);
INSERT INTO "equipmentTypes" ("id","name","stock") VALUES (15,'repair kit',1);

-- Equipment allowed per facility type (minQty = 0 means optional)
INSERT INTO "typeEquipment" VALUES (1,1,2);   -- tennis court: tennis racket (min 2)
INSERT INTO "typeEquipment" VALUES (1,2,3);   -- tennis court: tennis balls (min 3)
INSERT INTO "typeEquipment" VALUES (1,3,0);   -- tennis court: towel (optional)
INSERT INTO "typeEquipment" VALUES (2,4,1);   -- basketball court: basketball (min 1)
INSERT INTO "typeEquipment" VALUES (2,5,0);   -- basketball court: cones (optional)
INSERT INTO "typeEquipment" VALUES (3,6,1);   -- volleyball court: volleyball (min 1)
INSERT INTO "typeEquipment" VALUES (3,7,0);   -- volleyball court: knee pads (optional)
INSERT INTO "typeEquipment" VALUES (4,8,1);   -- soccer field: soccer ball (min 1)
INSERT INTO "typeEquipment" VALUES (4,9,10);  -- soccer field: soccer shoes (min 10)
INSERT INTO "typeEquipment" VALUES (4,10,0);  -- soccer field: goalkeeper gloves (optional)
INSERT INTO "typeEquipment" VALUES (5,11,2);  -- table tennis: rackets (min 2)
INSERT INTO "typeEquipment" VALUES (5,12,1);  -- table tennis: balls (min 1)
INSERT INTO "typeEquipment" VALUES (6,13,1);  -- cycling track: bicycle (min 1)
INSERT INTO "typeEquipment" VALUES (6,14,1);  -- cycling track: helmet (min 1)
INSERT INTO "typeEquipment" VALUES (6,15,0);  -- cycling track: repair kit (optional)

-- Users (password for everybody: pwd)
-- John: no reservations, score 0
-- Alice: one reservation, score -1
-- George: one reservation, score 0
-- Laura: two reservations, score -1
INSERT INTO "users" VALUES (1,'u1@p.it','John','f388305b92d508b1cb51d03ed9f97cd9c01035fab5effd3e902c6617ad9f640b','cb0d79679ea2e701','LXBSMDTMSP2I5XFXIYRGFVWSFI',0,0);
INSERT INTO "users" VALUES (2,'u2@p.it','Alice','c5b4b13fe36d44cc262192991d468e2128ed8d2dee3d995929ba9d159ed259af','eb05d49efbe8ecf0','LXBSMDTMSP2I5XFXIYRGFVWSFI',0,-1);
INSERT INTO "users" VALUES (3,'u3@p.it','George','ed593c1ce73be0e5c352cc16f4399f36d0500ea61fc2666bb6483802a3560e7f','eec88ca85892ccc9','LXBSMDTMSP2I5XFXIYRGFVWSFI',0,0);
INSERT INTO "users" VALUES (4,'u4@p.it','Laura','3be1d2ce368218e03dfb354303f54ed828ef6bc976ef74610bc44408084125e5','d2b568cf2269d1fb','LXBSMDTMSP2I5XFXIYRGFVWSFI',0,-1);

-- Preloaded reservations.
-- After these, at least one facility per type and at least one unit of each
-- equipment type are still available.
INSERT INTO "reservations" ("id","userId","facilityCode") VALUES (1,2,'B1');  -- Alice
INSERT INTO "reservations" ("id","userId","facilityCode") VALUES (2,3,'T1');  -- George
INSERT INTO "reservations" ("id","userId","facilityCode") VALUES (3,4,'C1');  -- Laura
INSERT INTO "reservations" ("id","userId","facilityCode") VALUES (4,4,'TT1'); -- Laura

-- Alice (B1): mandatory minimum only
INSERT INTO "reservationEquipment" VALUES (1,4,1);   -- basketball x1
-- George (T1): above-minimum mandatory plus one optional item
INSERT INTO "reservationEquipment" VALUES (2,1,3);   -- tennis racket x3
INSERT INTO "reservationEquipment" VALUES (2,2,4);   -- tennis balls x4
INSERT INTO "reservationEquipment" VALUES (2,3,1);   -- towel x1
-- Laura (C1): mandatory minimum only
INSERT INTO "reservationEquipment" VALUES (3,13,1);  -- bicycle x1
INSERT INTO "reservationEquipment" VALUES (3,14,1);  -- helmet x1
-- Laura (TT1): mandatory minimum only
INSERT INTO "reservationEquipment" VALUES (4,11,2);  -- table tennis racket x2
INSERT INTO "reservationEquipment" VALUES (4,12,1);  -- table tennis balls x1

COMMIT;
