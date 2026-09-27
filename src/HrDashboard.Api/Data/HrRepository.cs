using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using HrDashboard.Api.Configuration;
using HrDashboard.Api.Models;

namespace HrDashboard.Api.Data;

public interface IHrRepository
{
    Task<AcademicYearInfo?>            GetAcademicYearAsync(CancellationToken ct);
    Task<List<Employee>>               GetEmployeesAsync(Scope scope, CancellationToken ct);
    Task<AttendanceSummary>            GetAttendanceSummaryAsync(DateOnly? from, DateOnly? to, string? dept, string? staffType, CancellationToken ct);
    Task<List<EmployeeAttendance>>     GetAttendanceByEmployeeAsync(DateOnly? from, DateOnly? to, string? dept, string? staffType, CancellationToken ct);
    Task<List<DepartmentAttendance>>   GetAttendanceByDepartmentAsync(DateOnly? from, DateOnly? to, CancellationToken ct);
    Task<List<MonthPoint>>             GetEmployeeMonthsAsync(string empCode, DateOnly? from, DateOnly? to, CancellationToken ct);
}

public sealed class HrRepository : IHrRepository
{
    private readonly ISqlRunner _sql;
    private readonly DashboardOptions _opt;

    public HrRepository(ISqlRunner sql, IOptions<DashboardOptions> opt)
    { _sql = sql; _opt = opt.Value; }

    private static string ScopeKey(Scope s) => s switch
    {
        Scope.HrActive  => "HR_ACTIVE",
        Scope.HrService => "HR_SERVICE",
        Scope.Attended  => "ATTENDED",
        Scope.OnSite    => "ON_SITE",
        _               => "ALL"
    };

    public Task<AcademicYearInfo?> GetAcademicYearAsync(CancellationToken ct) =>
        _sql.QueryAsync("hrv2.usp_AcademicYear",
            p => p.AddWithValue("@MinStaffOnSite", _opt.MinStaffOnSite),
            r => new AcademicYearInfo
            {
                AcademicYear  = r.Str("AcademicYear") ?? "",
                Description   = r.Str("Description"),
                StartDate     = r.DateOrNull("StartDate")  ?? default,
                EndDate       = r.DateOrNull("EndDate")    ?? default,
                OpenDays      = r.Int("OpenDays") ?? 0,
                LastOpenDate  = r.DateOrNull("LastOpenDate"),
                LastPunchDate = r.DateOrNull("LastPunchDate")
            }, ct)
        .ContinueWith(t => t.Result.FirstOrDefault(), ct);

    public Task<List<Employee>> GetEmployeesAsync(Scope scope, CancellationToken ct) =>
        _sql.QueryAsync("hrv2.usp_EmployeeList", p =>
        {
            p.AddWithValue("@Scope",            ScopeKey(scope));
            p.AddWithValue("@OnSiteOpenDays",   _opt.OnSiteOpenDays);
            p.AddWithValue("@MinStaffOnSite",   _opt.MinStaffOnSite);
            p.AddWithValue("@LateAfterMinutes", _opt.LateAfterMinutes);
        }, MapEmployee, ct);

    private static Employee MapEmployee(SqlDataReader r) => new()
    {
        EmpCode           = r.Str("EmpCode") ?? "",
        FullName          = r.Str("FullName"),
        Department        = r.Str("Department"),
        Designation       = r.Str("Designation"),
        HrStatusCode      = r.Str("HrStatusCode"),
        ServiceStatusCode = r.Str("ServiceStatusCode"),
        StaffTypeCode     = r.Str("StaffTypeCode"),
        StaffType         = r.Str("StaffType"),
        GenderCode        = r.Str("GenderCode"),
        Nationality       = r.Str("Nationality"),
        Mobile            = r.Str("Mobile"),
        DateOfBirth       = r.DateOrNull("DateOfBirth"),
        DateOfJoin        = r.DateOrNull("DateOfJoin"),
        LeftDate          = r.DateOrNull("LeftDate"),
        LastLogin         = r.DateTimeOrNull("LastLogin"),

        EmiratesId = new DocumentInfo { Number = r.Str("EmiratesIdNo"),  IssueDate = r.DateOrNull("EmiratesIdIssue"),  ExpiryDate = r.DateOrNull("EmiratesIdExpiry") },
        Passport   = new DocumentInfo { Number = r.Str("PassportNo"),    IssueDate = r.DateOrNull("PassportIssue"),    ExpiryDate = r.DateOrNull("PassportExpiry") },
        Visa       = new DocumentInfo { Number = r.Str("VisaNo"), Type = r.Str("VisaType"), IssueDate = r.DateOrNull("VisaIssue"), ExpiryDate = r.DateOrNull("VisaExpiry") },
        LabourCard = new DocumentInfo { Number = r.Str("LabourCardNo"),  IssueDate = r.DateOrNull("LabourCardIssue"),  ExpiryDate = r.DateOrNull("LabourCardExpiry") },
        Contract   = new DocumentInfo { Number = r.Str("ContractRef"),   IssueDate = r.DateOrNull("ContractStart"),    ExpiryDate = r.DateOrNull("ContractExpiry") },

        DaysPresent   = r.Int("DaysPresent"),
        OpenDays      = r.Int("OpenDaysInYear"),
        AttendancePct = r.Dec("AttendancePct"),
        Punches       = r.Int("Punches"),
        LateDays      = r.Int("LateDays"),
        NoOutDays     = r.Int("NoOutDays"),
        LastSeen      = r.DateOrNull("LastSeen"),
        AvgArrival    = r.MinutesAsClock("AvgArrivalMin"),
        AvgHours      = r.Dec("AvgHours"),

        HasStaleLeavingDate = (r.Int("HasStaleLeavingDate") ?? 0) == 1,
        Standing            = r.Str("Standing") ?? "Not enough information",
        StandingTone        = Tone(r.Str("Standing"))
    };

    private static string Tone(string? standing) => standing switch
    {
        "On site"                        => "ok",
        "On site - clear leaving date"   => "warn",
        "Stopped attending - confirm"    => "bad",
        "Not on site - system still used"=> "warn",
        _                                => "neutral"
    };

    public async Task<AttendanceSummary> GetAttendanceSummaryAsync(DateOnly? from, DateOnly? to,
        string? dept, string? staffType, CancellationToken ct)
    {
        var sets = await _sql.QueryMultipleAsync("hrv2.usp_AttendanceSummary", p =>
        {
            p.AddWithValue("@FromDate",         (object?)from?.ToDateTime(TimeOnly.MinValue) ?? DBNull.Value);
            p.AddWithValue("@ToDate",           (object?)to?.ToDateTime(TimeOnly.MinValue)   ?? DBNull.Value);
            p.AddWithValue("@Department",       (object?)dept      ?? DBNull.Value);
            p.AddWithValue("@StaffType",        (object?)staffType ?? DBNull.Value);
            p.AddWithValue("@MinStaffOnSite",   _opt.MinStaffOnSite);
            p.AddWithValue("@LateAfterMinutes", _opt.LateAfterMinutes);
        }, new Func<SqlDataReader, object>[]
        {
            r => new AttendanceKpis
            {
                OpenDays        = r.Int("OpenDays") ?? 0,
                StaffSeen       = r.Int("StaffSeen") ?? 0,
                StaffDaysOnSite = r.Int("StaffDaysOnSite") ?? 0,
                AvgArrival      = r.MinutesAsClock("AvgArrivalMinutes"),
                AvgHours        = r.Dec("AvgHours"),
                LateArrivals    = r.Int("LateArrivals") ?? 0,
                NoOutPunchDays  = r.Int("NoOutPunchDays") ?? 0,
                From            = from,
                To              = to
            },
            r => new DayOfWeekPoint
            {
                DayName        = r.Str("DayName") ?? "",
                DayNumber      = r.Int("DayNumber") ?? 0,
                AvgStaffOnSite = r.Dec("AvgStaffOnSite") ?? 0m
            },
            r => new DailyVolumePoint
            {
                PunchDate = r.DateOrNull("PunchDate") ?? default,
                Punches   = r.Int("Punches") ?? 0,
                People    = r.Int("People") ?? 0
            }
        }, ct);

        var kpis = sets.Count > 0 ? sets[0].Cast<AttendanceKpis>().FirstOrDefault() ?? new() : new();
        kpis.From = from; kpis.To = to;
        kpis.PopulationNote =
            "Counts the employees whose badge matches an HR record. The badge system also holds " +
            "badges with no matching record; they are left out so that the figures, the day-of-week " +
            "chart and the per-person table all describe the same group.";

        return new AttendanceSummary
        {
            Kpis        = kpis,
            ByDayOfWeek = sets.Count > 1 ? sets[1].Cast<DayOfWeekPoint>().ToList()   : new(),
            DailyVolume = sets.Count > 2 ? sets[2].Cast<DailyVolumePoint>().ToList() : new()
        };
    }

    public Task<List<EmployeeAttendance>> GetAttendanceByEmployeeAsync(DateOnly? from, DateOnly? to,
        string? dept, string? staffType, CancellationToken ct) =>
        _sql.QueryAsync("hrv2.usp_AttendanceByEmployee", p =>
        {
            p.AddWithValue("@FromDate",         (object?)from?.ToDateTime(TimeOnly.MinValue) ?? DBNull.Value);
            p.AddWithValue("@ToDate",           (object?)to?.ToDateTime(TimeOnly.MinValue)   ?? DBNull.Value);
            p.AddWithValue("@Department",       (object?)dept      ?? DBNull.Value);
            p.AddWithValue("@StaffType",        (object?)staffType ?? DBNull.Value);
            p.AddWithValue("@MinStaffOnSite",   _opt.MinStaffOnSite);
            p.AddWithValue("@LateAfterMinutes", _opt.LateAfterMinutes);
        }, r => new EmployeeAttendance
        {
            EmpCode           = r.Str("EmpCode") ?? "",
            FullName          = r.Str("FullName"),
            Department        = r.Str("Department"),
            Designation       = r.Str("Designation"),
            StaffType         = r.Str("StaffType"),
            DaysPresent       = r.Int("DaysPresent") ?? 0,
            OpenDays          = r.Int("OpenDays") ?? 0,
            AttendancePct     = r.Dec("AttendancePct"),
            AvgArrival        = r.MinutesAsClock("AvgArrivalMinutes"),
            AvgHours          = r.Dec("AvgHours"),
            NoOutPunchDays    = r.Int("NoOutPunchDays") ?? 0,
            LateArrivals      = r.Int("LateArrivals") ?? 0,
            Punches           = r.Int("Punches") ?? 0,
            LastSeen          = r.DateOrNull("LastSeen"),
            DaysSinceLastSeen = r.Int("DaysSinceLastSeen")
        }, ct);

    public Task<List<DepartmentAttendance>> GetAttendanceByDepartmentAsync(DateOnly? from, DateOnly? to,
        CancellationToken ct) =>
        _sql.QueryAsync("hrv2.usp_AttendanceByDepartment", p =>
        {
            p.AddWithValue("@FromDate",         (object?)from?.ToDateTime(TimeOnly.MinValue) ?? DBNull.Value);
            p.AddWithValue("@ToDate",           (object?)to?.ToDateTime(TimeOnly.MinValue)   ?? DBNull.Value);
            p.AddWithValue("@MinStaffOnSite",   _opt.MinStaffOnSite);
            p.AddWithValue("@LateAfterMinutes", _opt.LateAfterMinutes);
        }, r => new DepartmentAttendance
        {
            Department       = r.Str("Department") ?? "Not recorded",
            Staff            = r.Int("Staff") ?? 0,
            PresentStaffDays = r.Int("PresentStaffDays") ?? 0,
            TotalStaffDays   = r.Int("TotalStaffDays") ?? 0,
            AttendancePct    = r.Dec("AttendancePct"),
            AvgArrival       = r.MinutesAsClock("AvgArrivalMinutes"),
            AvgHours         = r.Dec("AvgHours"),
            NoOutPunchDays   = r.Int("NoOutPunchDays") ?? 0,
            LateArrivals     = r.Int("LateArrivals") ?? 0
        }, ct);

    public Task<List<MonthPoint>> GetEmployeeMonthsAsync(string empCode, DateOnly? from, DateOnly? to,
        CancellationToken ct) =>
        _sql.QueryAsync("hrv2.usp_EmployeeMonths", p =>
        {
            p.AddWithValue("@EmpCode",        empCode);
            p.AddWithValue("@FromDate",       (object?)from?.ToDateTime(TimeOnly.MinValue) ?? DBNull.Value);
            p.AddWithValue("@ToDate",         (object?)to?.ToDateTime(TimeOnly.MinValue)   ?? DBNull.Value);
            p.AddWithValue("@MinStaffOnSite", _opt.MinStaffOnSite);
        }, r => new MonthPoint
        {
            YearMonth   = r.Str("YearMonth") ?? "",
            DaysPresent = r.Int("DaysPresent") ?? 0,
            Punches     = r.Int("Punches") ?? 0
        }, ct);
}
