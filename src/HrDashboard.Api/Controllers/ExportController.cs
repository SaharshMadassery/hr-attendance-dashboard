using System.Text;
using Microsoft.AspNetCore.Mvc;
using HrDashboard.Api.Data;
using HrDashboard.Api.Models;
using HrDashboard.Api.Services;

namespace HrDashboard.Api.Controllers;

/// <summary>
/// CSV export. The caller chooses the columns; the server writes every
/// matching row, never just the page on screen.
/// </summary>
[ApiController]
[Route("api/export")]
public sealed class ExportController : ControllerBase
{
    private readonly EmployeeCache _cache;
    private readonly IHrRepository _repo;

    public ExportController(EmployeeCache cache, IHrRepository repo)
    { _cache = cache; _repo = repo; }

    private static readonly Dictionary<string, Func<Employee, object?>> EmployeeColumns =
        new(StringComparer.OrdinalIgnoreCase)
    {
        ["Emp Code"]        = e => e.EmpCode,
        ["Name"]            = e => e.FullName,
        ["Nationality"]     = e => e.Nationality,
        ["Mobile"]          = e => e.Mobile,
        ["Birth date"]      = e => e.DateOfBirth,
        ["Date of join"]    = e => e.DateOfJoin,
        ["Gender"]          = e => e.Gender,
        ["Staff type"]      = e => e.StaffType,
        ["Department"]      = e => e.Department,
        ["Designation"]     = e => e.Designation,
        ["HR status"]       = e => e.HrStatusCode == "A" ? "Active" : e.HrStatusCode == "I" ? "Ex-employee" : null,
        ["Standing"]        = e => e.Standing,
        ["Last seen"]       = e => e.LastSeen,
        ["Days present"]    = e => e.DaysPresent,
        ["Attendance %"]    = e => e.AttendancePct,
        ["Avg arrival"]     = e => e.AvgArrival,
        ["Avg hours"]       = e => e.AvgHours,
        ["Late arrivals"]   = e => e.LateDays,
        ["No out punch"]    = e => e.NoOutDays,
        ["Last login"]      = e => e.LastLogin,
        ["Emirates ID no"]  = e => e.EmiratesId.Number,
        ["Emirates ID expiry"] = e => e.EmiratesId.ExpiryDate,
        ["Passport no"]     = e => e.Passport.Number,
        ["Passport expiry"] = e => e.Passport.ExpiryDate,
        ["Visa no"]         = e => e.Visa.Number,
        ["Visa type"]       = e => e.Visa.Type,
        ["Visa issue date"] = e => e.Visa.IssueDate,
        ["Visa expiry date"]= e => e.Visa.ExpiryDate,
        ["Visa status"]     = e => e.Visa.State,
        ["Labour card no"]  = e => e.LabourCard.Number,
        ["Labour card expiry"] = e => e.LabourCard.ExpiryDate,
        ["Contract ref"]    = e => e.Contract.Number,
        ["Contract expiry"] = e => e.Contract.ExpiryDate
    };

    /// <summary>The column names the client may ask for, in a sensible default order.</summary>
    [HttpGet("employees/columns")]
    public ActionResult<List<string>> Columns() => EmployeeColumns.Keys.ToList();

    [HttpGet("employees")]
    public async Task<IActionResult> Employees(
        [FromQuery] Scope scope = Scope.All,
        [FromQuery] string? facet = null,
        [FromQuery] string? value = null,
        [FromQuery] string? columns = null,
        CancellationToken ct = default)
    {
        IEnumerable<Employee> people = await _cache.GetAsync(scope, ct);
        if (!string.IsNullOrWhiteSpace(facet) && value is not null)
            people = OverviewBuilder.Filter(people, facet, value);

        var chosen = (columns ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(EmployeeColumns.ContainsKey).ToList();
        if (chosen.Count == 0) chosen = EmployeeColumns.Keys.ToList();

        var csv = CsvExporter.Write(people, chosen, (e, c) => EmployeeColumns[c](e));
        var name = $"employees-{scope}{(value is null ? "" : "-" + Slug(value))}.csv";
        return File(Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", name);
    }

    [HttpGet("attendance")]
    public async Task<IActionResult> Attendance(
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] string? department = null, [FromQuery] string? staffType = null,
        CancellationToken ct = default)
    {
        var rows = await _repo.GetAttendanceByEmployeeAsync(from, to, department, staffType, ct);
        var cols = new List<string>
        {
            "Emp Code","Name","Department","Designation","Staff type","Days present","Open days",
            "Attendance %","Avg arrival","Avg hours","No out punch","Late arrivals","Punches",
            "Last seen","Days since last seen"
        };
        var csv = CsvExporter.Write(rows, cols, (r, c) => c switch
        {
            "Emp Code" => r.EmpCode, "Name" => r.FullName, "Department" => r.Department,
            "Designation" => r.Designation, "Staff type" => r.StaffType,
            "Days present" => r.DaysPresent, "Open days" => r.OpenDays,
            "Attendance %" => r.AttendancePct, "Avg arrival" => r.AvgArrival,
            "Avg hours" => r.AvgHours, "No out punch" => r.NoOutPunchDays,
            "Late arrivals" => r.LateArrivals, "Punches" => r.Punches,
            "Last seen" => r.LastSeen, "Days since last seen" => r.DaysSinceLastSeen,
            _ => null
        });
        var tag = from is null && to is null ? "full-year" : $"{from:yyyy-MM-dd}_to_{to:yyyy-MM-dd}";
        return File(Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", $"attendance-{tag}.csv");
    }

    private static string Slug(string s) =>
        new string(s.Select(c => char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : '-').ToArray())
            .Trim('-');
}
