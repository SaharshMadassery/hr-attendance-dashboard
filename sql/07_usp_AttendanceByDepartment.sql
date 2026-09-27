/* =====================================================================
   hrv2.usp_AttendanceByDepartment — the same measures aggregated by
   department. Counted in staff-days, one employee on one day, not people.
   Read-only.
   ===================================================================== */
CREATE OR ALTER PROCEDURE hrv2.usp_AttendanceByDepartment
    @AcademicYear     NVARCHAR(20) = NULL,
    @FromDate         DATE         = NULL,
    @ToDate           DATE         = NULL,
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

    ;WITH day_rows AS (
        SELECT e.em_number, e.em_dept_code, e.em_company_code,
               CAST(l.user_punch_date AS date) AS work_day,
               MIN(CASE WHEN l.user_in_out = '0' THEN l.user_punch_date END) AS first_in,
               MAX(CASE WHEN l.user_in_out = '1' THEN l.user_punch_date END) AS last_out
        FROM   comn.comn_attendance_machine_user_log AS l
        JOIN   pays.pays_employee AS e ON e.em_punching_id = l.user_id
        JOIN   @days AS d ON d.OpenDate = CAST(l.user_punch_date AS date)
        GROUP BY e.em_number, e.em_dept_code, e.em_company_code, CAST(l.user_punch_date AS date)
    )
    SELECT  ISNULL(dp.codp_dept_name, 'Not recorded')  AS Department,
            COUNT(DISTINCT r.em_number)                AS Staff,
            COUNT(*)                                   AS PresentStaffDays,
            COUNT(DISTINCT r.em_number) * @n           AS TotalStaffDays,
            CAST(ROUND(100.0 * COUNT(*)
                 / NULLIF(COUNT(DISTINCT r.em_number) * @n, 0), 1) AS decimal(5,1)) AS AttendancePct,
            CAST(AVG(CAST(DATEDIFF(MINUTE, CAST(r.work_day AS datetime), r.first_in) AS float)) AS int)
                                                       AS AvgArrivalMinutes,
            CAST(AVG(CASE WHEN r.last_out IS NOT NULL
                          THEN DATEDIFF(MINUTE, r.first_in, r.last_out) / 60.0 END) AS decimal(5,1))
                                                       AS AvgHours,
            SUM(CASE WHEN r.last_out IS NULL THEN 1 ELSE 0 END) AS NoOutPunchDays,
            SUM(CASE WHEN r.first_in IS NOT NULL
                      AND DATEDIFF(MINUTE, CAST(r.work_day AS datetime), r.first_in) > @LateAfterMinutes
                     THEN 1 ELSE 0 END)                AS LateArrivals
    FROM        day_rows AS r
    LEFT JOIN   fins.fins_departments AS dp
                ON dp.codp_dept_no = r.em_dept_code
               AND dp.codp_comp_code = r.em_company_code
               AND dp.codp_year = @DeptYear
    GROUP BY ISNULL(dp.codp_dept_name, 'Not recorded')
    ORDER BY Staff DESC;
END
GO
