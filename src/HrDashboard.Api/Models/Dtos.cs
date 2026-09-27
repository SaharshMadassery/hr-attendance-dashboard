namespace HrDashboard.Api.Models;

public sealed class AcademicYearInfo
{
    public string    AcademicYear  { get; set; } = "";
    public string?   Description   { get; set; }
    public DateOnly  StartDate     { get; set; }
    public DateOnly  EndDate       { get; set; }
    public int       OpenDays      { get; set; }
    public DateOnly? LastOpenDate  { get; set; }
    public DateOnly? LastPunchDate { get; set; }
}

/// <summary>
/// The five populations. They exist because the HR system's own dashboard
/// draws one screen from three of them, and because attendance answers a
/// different question from the status fields.
/// </summary>
public enum Scope { All, HrActive, HrService, Attended, OnSite }

public sealed class ScopeInfo
{
    public string Key         { get; set; } = "";
    public string Name        { get; set; } = "";
    public string Definition  { get; set; } = "";
    public string UseItFor    { get; set; } = "";
    public int    Count       { get; set; }
}

/// <summary>One clickable line on an Overview card.</summary>
public sealed class CardLine
{
    public string Label { get; set; } = "";
    public int    Count { get; set; }
    /// <summary>Filter key the client sends back to list the people behind it.</summary>
    public string Facet { get; set; } = "";
    public string Value { get; set; } = "";
}

public sealed class Card
{
    public string         Title     { get; set; } = "";
    public string         Facet     { get; set; } = "";
    public List<CardLine> Lines     { get; set; } = new();
    /// <summary>Set when the card is informational and its lines cannot be opened.</summary>
    public string?        Note      { get; set; }
    public bool           Clickable { get; set; } = true;
}

public sealed class OverviewResult
{
    public ScopeInfo       Scope  { get; set; } = new();
    public List<ScopeInfo> Scopes { get; set; } = new();
    public List<Card>      Cards  { get; set; } = new();
}

public sealed class AttendanceKpis
{
    public int      OpenDays          { get; set; }
    public int      StaffSeen         { get; set; }
    public int      StaffDaysOnSite   { get; set; }
    public string?  AvgArrival        { get; set; }
    public decimal? AvgHours          { get; set; }
    public int      LateArrivals      { get; set; }
    public int      NoOutPunchDays    { get; set; }
    public DateOnly? From             { get; set; }
    public DateOnly? To               { get; set; }
    /// <summary>Stated on the page: which people these figures describe.</summary>
    public string   PopulationNote    { get; set; } = "";
}

public sealed class DayOfWeekPoint
{
    public string  DayName        { get; set; } = "";
    public int     DayNumber      { get; set; }
    public decimal AvgStaffOnSite { get; set; }
}

public sealed class DailyVolumePoint
{
    public DateOnly PunchDate { get; set; }
    public int      Punches   { get; set; }
    public int      People    { get; set; }
}

public sealed class AttendanceSummary
{
    public AttendanceKpis         Kpis        { get; set; } = new();
    public List<DayOfWeekPoint>   ByDayOfWeek { get; set; } = new();
    public List<DailyVolumePoint> DailyVolume { get; set; } = new();
}

public sealed class EmployeeAttendance
{
    public string   EmpCode           { get; set; } = "";
    public string?  FullName          { get; set; }
    public string?  Department        { get; set; }
    public string?  Designation       { get; set; }
    public string?  StaffType         { get; set; }
    public int      DaysPresent       { get; set; }
    public int      OpenDays          { get; set; }
    public decimal? AttendancePct     { get; set; }
    public string?  AvgArrival        { get; set; }
    public decimal? AvgHours          { get; set; }
    public int      NoOutPunchDays    { get; set; }
    public int      LateArrivals      { get; set; }
    public int      Punches           { get; set; }
    public DateOnly? LastSeen         { get; set; }
    public int?     DaysSinceLastSeen { get; set; }
}

public sealed class DepartmentAttendance
{
    public string   Department       { get; set; } = "";
    public int      Staff            { get; set; }
    public int      PresentStaffDays { get; set; }
    public int      TotalStaffDays   { get; set; }
    public decimal? AttendancePct    { get; set; }
    public string?  AvgArrival       { get; set; }
    public decimal? AvgHours         { get; set; }
    public int      NoOutPunchDays   { get; set; }
    public int      LateArrivals     { get; set; }
}

public sealed class MonthPoint
{
    public string YearMonth   { get; set; } = "";
    public int    DaysPresent { get; set; }
    public int    Punches     { get; set; }
}
