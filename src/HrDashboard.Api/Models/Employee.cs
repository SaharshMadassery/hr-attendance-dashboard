namespace HrDashboard.Api.Models;

/// <summary>One employee, as the Overview cards and the roster need them.</summary>
public sealed class Employee
{
    public string  EmpCode      { get; set; } = "";
    public string? FullName     { get; set; }
    public string? Department   { get; set; }
    public string? Designation  { get; set; }

    // --- HR record ---------------------------------------------------
    /// <summary>em_status: A or I. "Active" here is the HR field, not attendance.</summary>
    public string? HrStatusCode      { get; set; }
    public string? ServiceStatusCode { get; set; }
    public string? StaffTypeCode     { get; set; }
    public string? StaffType         { get; set; }
    public string? GenderCode        { get; set; }
    public string? Nationality       { get; set; }
    public string? Mobile            { get; set; }
    public DateOnly? DateOfBirth     { get; set; }
    public DateOnly? DateOfJoin      { get; set; }
    public DateOnly? LeftDate        { get; set; }
    public DateTime? LastLogin       { get; set; }

    // --- documents ---------------------------------------------------
    public DocumentInfo EmiratesId { get; set; } = new();
    public DocumentInfo Passport   { get; set; } = new();
    public DocumentInfo Visa       { get; set; } = new();
    public DocumentInfo LabourCard { get; set; } = new();
    public DocumentInfo Contract   { get; set; } = new();

    // --- attendance --------------------------------------------------
    public int?      DaysPresent   { get; set; }
    public int?      OpenDays      { get; set; }
    public decimal?  AttendancePct { get; set; }
    public int?      Punches       { get; set; }
    public int?      LateDays      { get; set; }
    public int?      NoOutDays     { get; set; }
    public DateOnly? LastSeen      { get; set; }
    public string?   AvgArrival    { get; set; }   // HH:mm, truncated not rounded
    public decimal?  AvgHours      { get; set; }

    // --- derived -----------------------------------------------------
    /// <summary>One of the six categories. See hr_standing_classification.md.</summary>
    public string  Standing        { get; set; } = "";
    public string  StandingTone    { get; set; } = "neutral";
    public bool    HasStaleLeavingDate { get; set; }
    public string? Gender => GenderCode switch { "F" => "Female", "M" => "Male", _ => null };
}

/// <summary>
/// A document reduced to what HR acts on: is there a number, and has it expired.
/// State is Valid, Expired or "No data" — never 0, because an empty field is a
/// gap in what was entered rather than a finding about the person.
/// </summary>
public sealed class DocumentInfo
{
    public string?   Number     { get; set; }
    public string?   Type       { get; set; }
    public DateOnly? IssueDate  { get; set; }
    public DateOnly? ExpiryDate { get; set; }

    public string State =>
        ExpiryDate is null            ? "No data"
        : ExpiryDate > DateOnly.FromDateTime(DateTime.Today) ? "Valid"
        : "Expired";
}
