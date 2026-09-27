/* =====================================================================
   hrv2.usp_AttendanceSummary — the headline attendance figures for a
   date range, plus the day-of-week and daily-volume series behind them.

   Returns three result sets:
     1. the six KPI figures
     2. average staff on site per day of week
     3. one row per open day: punches and distinct people

   DEFINITIONS, all verified against the published report:
     - only school-open days count
     - a late arrival is a first punch STRICTLY AFTER @LateAfterMinutes
       (08:00). Using >= instead reproduces only 161 of 211 staff.
     - hours exclude days with no out punch, because the out time is
       unknown on those days
     - average arrival truncates to the minute rather than rounding

   POPULATION: employees whose badge matches an HR record. The badge
   system also holds badges with no matching record; they are excluded so
   that every figure on the page describes the same group.

   Read-only.
   ===================================================================== */
CREATE OR ALTER PROCEDURE hrv2.usp_AttendanceSummary
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

    DECLARE @dayRows TABLE (
        em_number NVARCHAR(50), work_day date,
        first_in datetime NULL, last_out datetime NULL, punches int
    );
    INSERT INTO @dayRows
    SELECT e.em_number,
           CAST(l.user_punch_date AS date),
           MIN(CASE WHEN l.user_in_out = '0' THEN l.user_punch_date END),
           MAX(CASE WHEN l.user_in_out = '1' THEN l.user_punch_date END),
           COUNT(*)
    FROM   comn.comn_attendance_machine_user_log AS l
    JOIN   pays.pays_employee AS e ON e.em_punching_id = l.user_id
    JOIN   @days AS d ON d.OpenDate = CAST(l.user_punch_date AS date)
    LEFT   JOIN fins.fins_departments AS dp
           ON dp.codp_dept_no = e.em_dept_code
          AND dp.codp_comp_code = e.em_company_code
          AND dp.codp_year = @DeptYear
    WHERE  (@Department IS NULL OR dp.codp_dept_name = @Department)
      AND  (@StaffType  IS NULL OR e.em_staff_type   = @StaffType)
    GROUP BY e.em_number, CAST(l.user_punch_date AS date);

    /* 1 — the six tiles */
    SELECT
        (SELECT COUNT(*) FROM @days)                                   AS OpenDays,
        COUNT(DISTINCT em_number)                                      AS StaffSeen,
        COUNT(*)                                                       AS StaffDaysOnSite,
        CAST(AVG(CAST(DATEDIFF(MINUTE, CAST(work_day AS datetime), first_in) AS float)) AS int)
                                                                       AS AvgArrivalMinutes,
        CAST(AVG(CASE WHEN last_out IS NOT NULL
                      THEN DATEDIFF(MINUTE, first_in, last_out) / 60.0 END) AS decimal(5,1))
                                                                       AS AvgHours,
        SUM(CASE WHEN first_in IS NOT NULL
                  AND DATEDIFF(MINUTE, CAST(work_day AS datetime), first_in) > @LateAfterMinutes
                 THEN 1 ELSE 0 END)                                    AS LateArrivals,
        SUM(CASE WHEN last_out IS NULL THEN 1 ELSE 0 END)              AS NoOutPunchDays
    FROM @dayRows;

    /* 2 — average staff on site by day of week */
    SELECT  DATENAME(WEEKDAY, d.OpenDate)                        AS DayName,
            DATEPART(WEEKDAY, d.OpenDate)                        AS DayNumber,
            COUNT(DISTINCT d.OpenDate)                           AS OpenDaysOfThisWeekday,
            CAST(COUNT(r.em_number) * 1.0
                 / NULLIF(COUNT(DISTINCT d.OpenDate), 0) AS decimal(6,1)) AS AvgStaffOnSite
    FROM    @days AS d
    LEFT    JOIN @dayRows AS r ON r.work_day = d.OpenDate
    GROUP BY DATENAME(WEEKDAY, d.OpenDate), DATEPART(WEEKDAY, d.OpenDate)
    ORDER BY DayNumber;

    /* 3 — daily volume */
    SELECT  d.OpenDate                        AS PunchDate,
            ISNULL(SUM(r.punches), 0)         AS Punches,
            COUNT(DISTINCT r.em_number)       AS People
    FROM    @days AS d
    LEFT    JOIN @dayRows AS r ON r.work_day = d.OpenDate
    GROUP BY d.OpenDate
    ORDER BY d.OpenDate;
END
GO
