/* =====================================================================
   hrv2.usp_AcademicYear — the current academic year and its shape

   Status 'C' marks the current year, so the application follows the
   school's own rollover instead of hard-coding dates.
   Read-only.
   ===================================================================== */
CREATE OR ALTER PROCEDURE hrv2.usp_AcademicYear
    @MinStaffOnSite INT = 8
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ay NVARCHAR(20) =
        (SELECT TOP (1) sims_academic_year
         FROM   sims.sims_academic_year
         WHERE  sims_academic_year_status = 'C'
         ORDER BY sims_academic_year_start_date DESC);

    SELECT  y.sims_academic_year               AS AcademicYear,
            y.sims_academic_year_description   AS Description,
            y.sims_academic_year_start_date    AS StartDate,
            y.sims_academic_year_end_date      AS EndDate,
            (SELECT COUNT(*)  FROM hrv2.fn_OpenDays(y.sims_academic_year, @MinStaffOnSite)) AS OpenDays,
            (SELECT MAX(OpenDate) FROM hrv2.fn_OpenDays(y.sims_academic_year, @MinStaffOnSite)) AS LastOpenDate,
            (SELECT MAX(CAST(user_punch_date AS date))
             FROM   comn.comn_attendance_machine_user_log)                                   AS LastPunchDate
    FROM    sims.sims_academic_year AS y
    WHERE   y.sims_academic_year = @ay;
END
GO
