/* =====================================================================
   hrv2.usp_EmployeeMonths — month-by-month attendance for one person,
   the drill-down behind a row click. Read-only.
   ===================================================================== */
CREATE OR ALTER PROCEDURE hrv2.usp_EmployeeMonths
    @EmpCode        NVARCHAR(50),
    @AcademicYear   NVARCHAR(20) = NULL,
    @FromDate       DATE         = NULL,
    @ToDate         DATE         = NULL,
    @MinStaffOnSite INT          = 8
AS
BEGIN
    SET NOCOUNT ON;

    IF @AcademicYear IS NULL
        SELECT TOP (1) @AcademicYear = sims_academic_year
        FROM   sims.sims_academic_year
        WHERE  sims_academic_year_status = 'C'
        ORDER BY sims_academic_year_start_date DESC;

    ;WITH days AS (
        SELECT OpenDate FROM hrv2.fn_OpenDays(@AcademicYear, @MinStaffOnSite)
        WHERE  (@FromDate IS NULL OR OpenDate >= @FromDate)
          AND  (@ToDate   IS NULL OR OpenDate <= @ToDate)
    ),
    day_rows AS (
        SELECT CAST(l.user_punch_date AS date) AS work_day, COUNT(*) AS punches
        FROM   comn.comn_attendance_machine_user_log AS l
        JOIN   pays.pays_employee AS e ON e.em_punching_id = l.user_id
        JOIN   days AS d ON d.OpenDate = CAST(l.user_punch_date AS date)
        WHERE  e.em_number = @EmpCode
        GROUP BY CAST(l.user_punch_date AS date)
    )
    SELECT  FORMAT(work_day, 'yyyy-MM') AS YearMonth,
            COUNT(*)                    AS DaysPresent,
            SUM(punches)                AS Punches
    FROM    day_rows
    GROUP BY FORMAT(work_day, 'yyyy-MM')
    ORDER BY YearMonth;
END
GO
