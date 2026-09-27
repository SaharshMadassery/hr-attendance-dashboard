/* =====================================================================
   hrv2.usp_AttendanceByEmployee — one row per person for a date range.

   Same definitions as usp_AttendanceSummary. On the full-year range every
   column here reproduces the figures published by the version 1 report,
   with one exception noted in hr_dashboard_changelog.md: average hours is
   computed from punch times rather than from a per-day figure already
   rounded to one decimal, so it can differ by 0.1.

   Read-only.
   ===================================================================== */
CREATE OR ALTER PROCEDURE hrv2.usp_AttendanceByEmployee
    @AcademicYear     NVARCHAR(20) = NULL,
    @FromDate         DATE         = NULL,
    @ToDate           DATE         = NULL,
    @Department       NVARCHAR(100)= NULL,
    @StaffType        NVARCHAR(10) = NULL,
    @MinStaffOnSite   INT          = 8,
    @LateAfterMinutes INT          = 480
AS
BEGIN
    SET NOCOUNT ON;

    IF @AcademicYear IS NULL
        SELECT TOP (1) @AcademicYear = sims_academic_year
        FROM   sims.sims_academic_year
        WHERE  sims_academic_year_status = 'C'
        ORDER BY sims_academic_year_start_date DESC;

    DECLARE @DeptYear NVARCHAR(20) = @AcademicYear;

    DECLARE @days TABLE (OpenDate date PRIMARY KEY);
    INSERT INTO @days (OpenDate)
    SELECT OpenDate FROM hrv2.fn_OpenDays(@AcademicYear, @MinStaffOnSite)
    WHERE  (@FromDate IS NULL OR OpenDate >= @FromDate)
      AND  (@ToDate   IS NULL OR OpenDate <= @ToDate);

    DECLARE @n INT = (SELECT COUNT(*) FROM @days);
    DECLARE @lastOpen DATE = (SELECT MAX(OpenDate) FROM @days);

    ;WITH day_rows AS (
        SELECT e.em_number,
               CAST(l.user_punch_date AS date) AS work_day,
               MIN(CASE WHEN l.user_in_out = '0' THEN l.user_punch_date END) AS first_in,
               MAX(CASE WHEN l.user_in_out = '1' THEN l.user_punch_date END) AS last_out,
               COUNT(*) AS punches
        FROM   comn.comn_attendance_machine_user_log AS l
        JOIN   pays.pays_employee AS e ON e.em_punching_id = l.user_id
        JOIN   @days AS d ON d.OpenDate = CAST(l.user_punch_date AS date)
        GROUP BY e.em_number, CAST(l.user_punch_date AS date)
    )
    SELECT  e.em_number                       AS EmpCode,
            e.em_full_name                    AS FullName,
            dp.codp_dept_name                 AS Department,
            g.dg_desc                         AS Designation,
            CASE e.em_staff_type WHEN 'T' THEN 'Teaching' WHEN 'S' THEN 'Support'
                                 WHEN 'A' THEN 'Admin'    WHEN 'V' THEN 'Visiting Staff'
                                 ELSE 'Staff type ' + ISNULL(e.em_staff_type,'?') + ' (undecoded)'
            END                               AS StaffType,
            COUNT(*)                          AS DaysPresent,
            @n                                AS OpenDays,
            CAST(ROUND(100.0 * COUNT(*) / NULLIF(@n,0), 1) AS decimal(5,1)) AS AttendancePct,
            CAST(AVG(CAST(DATEDIFF(MINUTE, CAST(r.work_day AS datetime), r.first_in) AS float)) AS int)
                                              AS AvgArrivalMinutes,
            CAST(AVG(CASE WHEN r.last_out IS NOT NULL
                          THEN DATEDIFF(MINUTE, r.first_in, r.last_out) / 60.0 END) AS decimal(5,1))
                                              AS AvgHours,
            SUM(CASE WHEN r.last_out IS NULL THEN 1 ELSE 0 END) AS NoOutPunchDays,
            SUM(CASE WHEN r.first_in IS NOT NULL
                      AND DATEDIFF(MINUTE, CAST(r.work_day AS datetime), r.first_in) > @LateAfterMinutes
                     THEN 1 ELSE 0 END)       AS LateArrivals,
            SUM(r.punches)                    AS Punches,
            MAX(r.work_day)                   AS LastSeen,
            DATEDIFF(DAY, MAX(r.work_day), @lastOpen) AS DaysSinceLastSeen
    FROM        day_rows AS r
    JOIN        pays.pays_employee AS e ON e.em_number = r.em_number
    LEFT JOIN   fins.fins_departments AS dp
                ON dp.codp_dept_no = e.em_dept_code
               AND dp.codp_comp_code = e.em_company_code
               AND dp.codp_year = @DeptYear
    LEFT JOIN   pays.pays_designation AS g
                ON g.dg_code = e.em_desg_code AND g.dg_company_code = e.em_company_code
    WHERE  (@Department IS NULL OR dp.codp_dept_name = @Department)
      AND  (@StaffType  IS NULL OR e.em_staff_type   = @StaffType)
    GROUP BY e.em_number, e.em_full_name, dp.codp_dept_name, g.dg_desc, e.em_staff_type
    ORDER BY AttendancePct DESC, e.em_full_name;
END
GO
