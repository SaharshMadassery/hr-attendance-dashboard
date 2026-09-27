/* =====================================================================
   Hr Dashboard Ver 2 — 01_schema.sql
   Creates the hrv2 schema that every object in this folder lives in.

   Nothing existing is touched. All objects are created under hrv2 so the
   HRMS schemas (pays, sims, comn, fins) are only ever read from.

   The application connects with a login that needs SELECT on those
   schemas and EXECUTE on hrv2. It never needs write permission on data.
   ===================================================================== */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'hrv2')
    EXEC('CREATE SCHEMA hrv2');
GO
