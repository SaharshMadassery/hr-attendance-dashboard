/* =====================================================================
   hrv2.usp_EmployeeList — one row per employee, with everything the
   Overview cards, the roster and the standing classification need.

   @Scope selects the population. The five values exist because the HR
   system's own dashboard draws one screen from three different
   populations, and because attendance tells a different story from the
   status fields:

     ALL         every record on file                         (814)
     HR_ACTIVE   em_status = 'A'                              (344)
     HR_SERVICE  em_status = 'A' and em_service_status = 'V'  (341)
     ATTENDED    badged in at least once this year            (211)
     ON_SITE     badged within @OnSiteOpenDays open days      (176)

   Standing is computed here rather than in the application so that the
   roster, the export and any future report agree by construction.
   Its rules are documented in hr_standing_classification.md.

   Read-only.
   ===================================================================== */
CREATE OR ALTER PROCEDURE hrv2.usp_EmployeeList
    @AcademicYear     NVARCHAR(20) = NULL,
    @Scope            VARCHAR(20)  = 'ALL',
    @OnSiteOpenDays   INT          = 20,
    @MinStaffOnSite   INT          = 8,
    @LateAfterMinutes INT          = 480    -- 08:00; a punch AFTER this is late
AS
BEGIN
    SET NOCOUNT ON;

    IF @AcademicYear IS NULL
        SELECT TOP (1) @AcademicYear = sims_academic_year
        FROM   sims.sims_academic_year
        WHERE  sims_academic_year_status = 'C'
        ORDER BY sims_academic_year_start_date DESC;

    DECLARE @DeptYear NVARCHAR(20) = @AcademicYear;

    ;WITH open_days AS (
        SELECT OpenDate,
               ROW_NUMBER() OVER (ORDER BY OpenDate DESC) AS rn_from_end
        FROM   hrv2.fn_OpenDays(@AcademicYear, @MinStaffOnSite)
    ),
    /* the cut-off for "still on site": @OnSiteOpenDays school-open days
       back from the last open day, counted in open days so that half-term
       and the summer gap cannot turn regular staff into leavers */
    cutoff AS (
        SELECT MIN(OpenDate) AS OnSiteFrom FROM open_days WHERE rn_from_end <= @OnSiteOpenDays
    ),
    /* one row per employee per day actually worked, restricted to open days */
    day_rows AS (
        SELECT e.em_number,
               CAST(l.user_punch_date AS date) AS work_day,
               MIN(CASE WHEN l.user_in_out = '0' THEN l.user_punch_date END) AS first_in,
               MAX(CASE WHEN l.user_in_out = '1' THEN l.user_punch_date END) AS last_out,
               COUNT(*) AS punches
        FROM   comn.comn_attendance_machine_user_log AS l
        JOIN   pays.pays_employee AS e ON e.em_punching_id = l.user_id
        JOIN   open_days AS o ON o.OpenDate = CAST(l.user_punch_date AS date)
        GROUP BY e.em_number, CAST(l.user_punch_date AS date)
    ),
    att AS (
        SELECT em_number,
               COUNT(*)                      AS DaysPresent,
               SUM(punches)                  AS Punches,
               MAX(work_day)                 AS LastSeen,
               SUM(CASE WHEN first_in IS NOT NULL
                         AND DATEDIFF(MINUTE, CAST(work_day AS datetime), first_in) > @LateAfterMinutes
                        THEN 1 ELSE 0 END)   AS LateDays,
               SUM(CASE WHEN last_out IS NULL THEN 1 ELSE 0 END) AS NoOutDays,
               /* truncate to the minute; that is what reproduces the
                  published average arrival, rounding does not */
               CAST(AVG(CAST(DATEDIFF(MINUTE, CAST(work_day AS datetime), first_in) AS float)) AS int) AS AvgArrivalMin,
               AVG(CASE WHEN last_out IS NOT NULL
                        THEN DATEDIFF(MINUTE, first_in, last_out) / 60.0 END) AS AvgHours
        FROM   day_rows
        GROUP BY em_number
    ),
    /* a leaving date that precedes a later punch: the marker behind
       "On site — clear leaving date" */
    stale_leaver AS (
        SELECT DISTINCT d.em_number
        FROM   day_rows AS d
        JOIN   pays.pays_employee AS e ON e.em_number = d.em_number
        WHERE  e.em_left_date IS NOT NULL
          AND  d.work_day > CAST(e.em_left_date AS date)
    ),
    ay AS (
        SELECT sims_academic_year_start_date AS d_from,
               sims_academic_year_end_date   AS d_to
        FROM   sims.sims_academic_year WHERE sims_academic_year = @AcademicYear
    ),
    /* Last time the person used the HR system. comn_user.comn_user_last_login
       carries it directly; the account joins on comn_user_name = em_number,
       which is the key that resolves for all 814 employees. */
    last_login AS (
        SELECT u.comn_user_name AS em_number,
               MAX(u.comn_user_last_login) AS LastLogin
        FROM   comn.comn_user AS u
        GROUP  BY u.comn_user_name
    ),
    base AS (
        SELECT
            e.em_number                                   AS EmpCode,
            e.em_full_name                                AS FullName,
            e.em_status                                   AS HrStatusCode,
            e.em_service_status                           AS ServiceStatusCode,
            e.em_staff_type                               AS StaffTypeCode,
            CASE e.em_staff_type WHEN 'T' THEN 'Teaching'
                                 WHEN 'S' THEN 'Support'
                                 WHEN 'A' THEN 'Admin'
                                 WHEN 'V' THEN 'Visiting Staff'
                                 ELSE 'Staff type ' + ISNULL(e.em_staff_type,'?') + ' (undecoded)'
            END                                           AS StaffType,
            e.em_sex                                      AS GenderCode,
            n.sims_nationality_name_en                    AS Nationality,
            NULLIF(LTRIM(RTRIM(e.em_mobile)), '')         AS Mobile,
            CAST(e.em_date_of_birth AS date)              AS DateOfBirth,
            CAST(e.em_date_of_join  AS date)              AS DateOfJoin,
            CAST(e.em_left_date     AS date)              AS LeftDate,
            d.codp_dept_name                              AS Department,
            g.dg_desc                                     AS Designation,
            NULLIF(LTRIM(RTRIM(e.em_national_id)),'')     AS EmiratesIdNo,
            e.em_national_id_issue_date                   AS EmiratesIdIssue,
            e.em_national_id_expiry_date                  AS EmiratesIdExpiry,
            NULLIF(LTRIM(RTRIM(e.em_passport_number)),'') AS PassportNo,
            e.em_passport_issue_date                      AS PassportIssue,
            e.em_passport_expiry_date                     AS PassportExpiry,
            NULLIF(LTRIM(RTRIM(e.em_visa_number)),'')     AS VisaNo,
            NULLIF(LTRIM(RTRIM(e.em_visa_type)),'')       AS VisaType,
            e.em_visa_issue_date                          AS VisaIssue,
            e.em_visa_expiry_date                         AS VisaExpiry,
            NULLIF(LTRIM(RTRIM(e.en_labour_card_no)),'')  AS LabourCardNo,
            e.en_labour_card_issue_date                   AS LabourCardIssue,
            e.en_labour_card_expiry_date                  AS LabourCardExpiry,
            NULLIF(LTRIM(RTRIM(e.em_agreement)),'')       AS ContractRef,
            e.em_agreement_start_date                     AS ContractStart,
            e.em_agreement_exp_date                       AS ContractExpiry,
            a.DaysPresent, a.Punches, a.LastSeen, a.LateDays, a.NoOutDays,
            a.AvgArrivalMin, a.AvgHours,
            ll.LastLogin,
            CASE WHEN sl.em_number IS NOT NULL THEN 1 ELSE 0 END AS HasStaleLeavingDate,
            (SELECT COUNT(*) FROM hrv2.fn_OpenDays(@AcademicYear, @MinStaffOnSite)) AS OpenDaysInYear,
            (SELECT OnSiteFrom FROM cutoff) AS OnSiteFrom,
            (SELECT d_from FROM ay) AS YearFrom
        FROM        pays.pays_employee AS e
        LEFT JOIN   att            AS a  ON a.em_number = e.em_number
        LEFT JOIN   stale_leaver   AS sl ON sl.em_number = e.em_number
        LEFT JOIN   last_login     AS ll ON ll.em_number = e.em_number
        LEFT JOIN   sims.sims_nationality AS n ON n.sims_nationality_code = e.em_nation_code
        LEFT JOIN   fins.fins_departments AS d
                    ON  d.codp_dept_no   = e.em_dept_code
                    AND d.codp_comp_code = e.em_company_code
                    AND d.codp_year      = @DeptYear      -- pin the year or headcount fans out 12x
        LEFT JOIN   pays.pays_designation AS g
                    ON  g.dg_code         = e.em_desg_code
                    AND g.dg_company_code = e.em_company_code
    )
    SELECT b.*,
           CASE
             WHEN b.LastSeen IS NOT NULL AND b.LastSeen >= b.OnSiteFrom
                  THEN CASE WHEN b.HasStaleLeavingDate = 1
                            THEN 'On site - clear leaving date' ELSE 'On site' END
             WHEN b.LastSeen IS NOT NULL
                  THEN 'Stopped attending - confirm'
             WHEN b.LastLogin IS NOT NULL AND b.LastLogin >= b.YearFrom
                  THEN 'Not on site - system still used'
             WHEN b.DateOfJoin IS NOT NULL OR b.LastLogin IS NOT NULL
                  THEN 'Not on site this year'
             ELSE 'Not enough information'
           END AS Standing,
           CASE WHEN b.DaysPresent IS NULL OR b.OpenDaysInYear = 0 THEN NULL
                ELSE CAST(ROUND(100.0 * b.DaysPresent / b.OpenDaysInYear, 1) AS decimal(5,1))
           END AS AttendancePct
    FROM   base AS b
    WHERE  (@Scope = 'ALL')
       OR  (@Scope = 'HR_ACTIVE'  AND b.HrStatusCode = 'A')
       OR  (@Scope = 'HR_SERVICE' AND b.HrStatusCode = 'A' AND b.ServiceStatusCode = 'V')
       OR  (@Scope = 'ATTENDED'   AND b.LastSeen IS NOT NULL)
       OR  (@Scope = 'ON_SITE'    AND b.LastSeen IS NOT NULL AND b.LastSeen >= b.OnSiteFrom)
    ORDER BY b.FullName;
END
GO
