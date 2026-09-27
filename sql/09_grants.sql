/* =====================================================================
   09_grants.sql — the least privilege this application needs.

   The API only ever reads. It executes the hrv2 procedures, and those
   procedures SELECT from pays, comn, sims and fins. Nothing in this
   application inserts, updates or deletes anything.

   Replace HR_DASHBOARD_APP with the login you create for the service.
   Do not reuse a developer or administrator login for the application.
   ===================================================================== */
-- CREATE USER [HR_DASHBOARD_APP] FOR LOGIN [HR_DASHBOARD_APP];

GRANT EXECUTE ON SCHEMA::hrv2 TO [HR_DASHBOARD_APP];

GRANT SELECT ON SCHEMA::pays TO [HR_DASHBOARD_APP];
GRANT SELECT ON SCHEMA::comn TO [HR_DASHBOARD_APP];
GRANT SELECT ON SCHEMA::sims TO [HR_DASHBOARD_APP];
GRANT SELECT ON SCHEMA::fins TO [HR_DASHBOARD_APP];

/* Deliberately NOT granted: INSERT, UPDATE, DELETE, ALTER, CONTROL,
   db_datawriter, db_owner. If a future feature appears to need one of
   these, that is a design question to raise, not a grant to add. */
GO
