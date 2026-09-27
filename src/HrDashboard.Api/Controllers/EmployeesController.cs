using Microsoft.AspNetCore.Mvc;
using HrDashboard.Api.Models;
using HrDashboard.Api.Services;

namespace HrDashboard.Api.Controllers;

[ApiController]
[Route("api/employees")]
public sealed class EmployeesController : ControllerBase
{
    private readonly EmployeeCache _cache;
    public EmployeesController(EmployeeCache cache) { _cache = cache; }

    /// <summary>
    /// The people behind a card count, or the whole roster when no facet is given.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<Employee>>> Get(
        [FromQuery] Scope scope = Scope.All,
        [FromQuery] string? facet = null,
        [FromQuery] string? value = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        IEnumerable<Employee> people = await _cache.GetAsync(scope, ct);

        if (!string.IsNullOrWhiteSpace(facet) && value is not null)
            people = OverviewBuilder.Filter(people, facet, value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim();
            people = people.Where(p =>
                (p.FullName    ?? "").Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (p.EmpCode     ?? "").Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (p.Department  ?? "").Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (p.Designation ?? "").Contains(q, StringComparison.OrdinalIgnoreCase));
        }

        return people.ToList();
    }

    [HttpGet("{empCode}")]
    public async Task<ActionResult<Employee>> GetOne(string empCode, CancellationToken ct)
    {
        var people = await _cache.GetAsync(Scope.All, ct);
        var person = people.FirstOrDefault(p =>
            string.Equals(p.EmpCode, empCode, StringComparison.OrdinalIgnoreCase));
        return person is null ? NotFound($"No employee '{empCode}'.") : person;
    }
}
