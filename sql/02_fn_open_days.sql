/* =====================================================================
   hrv2.fn_OpenDays — the school-open days of an academic year

   DEFINITION, stated plainly because every attendance denominator rests
   on it: a date counts as a school-open day when at least @MinStaffOnSite
   employees with a matching HR record were recorded on the turnstile that
   day. It is measured from attendance, not from the published calendar,
   because the calendar carries no future-dated entries and marks as
   "Weekend" a number of days on which staff were demonstrably present.

   @MinStaffOnSite defaults to 8. Raising it counts only busier days;
   lowering it counts days when a caretaker or two came in. The figure is
   deliberately a parameter rather than a constant so the denominator can
   be justified rather than assumed.

   Read-only: selects from comn and pays, writes nothing.
   ===================================================================== */
CREATE OR ALTER FUNCTION hrv2.fn_OpenDays
(
    @AcademicYear   NVARCHAR(20),
    @MinStaffOnSite INT = 8
)
RETURNS TABLE
AS
RETURN
(
    WITH ay AS (
        SELECT sims_academic_year_start_date AS d_from,
               sims_academic_year_end_date   AS d_to
        FROM   sims.sims_academic_year
        WHERE  sims_academic_year = @AcademicYear
    ),
    punches AS (
        SELECT CAST(l.user_punch_date AS date) AS punch_day,
               e.em_number
        FROM   comn.comn_attendance_machine_user_log AS l
        JOIN   pays.pays_employee                    AS e
               ON e.em_punching_id = l.user_id
        CROSS JOIN ay
        WHERE  CAST(l.user_punch_date AS date) BETWEEN ay.d_from AND ay.d_to
    )
    SELECT punch_day AS OpenDate,
           COUNT(DISTINCT em_number) AS StaffOnSite
    FROM   punches
    GROUP BY punch_day
    HAVING COUNT(DISTINCT em_number) >= @MinStaffOnSite
);
GO
