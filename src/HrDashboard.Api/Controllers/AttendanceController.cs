using Microsoft.AspNetCore.Mvc;
using HrDashboard.Api.Data;
using HrDashboard.Api.Models;

namespace HrDashboard.Api.Controllers;

[ApiController]
[Route("api/attendance")]
public sealed class AttendanceController : ControllerBase
{
    private readonly IHrRepository _repo;
    public AttendanceController(IHrRepository repo) { _repo = repo; }

    /// <summary>KPIs, day-of-week averages and daily volume for a date range.</summary>
    [HttpGet("summary")]
    public Task<AttendanceSummary> Summary(
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] string? department = null, [FromQuery] string? staffType = null,
        CancellationToken ct = default)
        => _repo.GetAttendanceSummaryAsync(from, to, department, staffType, ct);

    [HttpGet("by-employee")]
    public Task<List<EmployeeAttendance>> ByEmployee(
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] string? department = null, [FromQuery] string? staffType = null,
        CancellationToken ct = default)
        => _repo.GetAttendanceByEmployeeAsync(from, to, department, staffType, ct);

    [HttpGet("by-department")]
    public Task<List<DepartmentAttendance>> ByDepartment(
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        CancellationToken ct = default)
        => _repo.GetAttendanceByDepartmentAsync(from, to, ct);

    /// <summary>Month-by-month for one person — the drill-down behind a row click.</summary>
    [HttpGet("{empCode}/months")]
    public Task<List<MonthPoint>> Months(string empCode,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        CancellationToken ct = default)
        => _repo.GetEmployeeMonthsAsync(empCode, from, to, ct);
}
