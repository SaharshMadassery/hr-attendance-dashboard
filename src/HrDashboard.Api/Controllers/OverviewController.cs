using Microsoft.AspNetCore.Mvc;
using HrDashboard.Api.Data;
using HrDashboard.Api.Models;
using HrDashboard.Api.Services;

namespace HrDashboard.Api.Controllers;

[ApiController]
[Route("api/overview")]
public sealed class OverviewController : ControllerBase
{
    private readonly EmployeeCache _cache;
    private readonly IHrRepository _repo;
    private readonly OverviewBuilder _builder;

    public OverviewController(EmployeeCache cache, IHrRepository repo, OverviewBuilder builder)
    { _cache = cache; _repo = repo; _builder = builder; }

    /// <summary>
    /// The five populations, with their counts, so the client can explain the
    /// choice rather than presenting five numbers without context.
    /// </summary>
    [HttpGet("scopes")]
    public async Task<ActionResult<List<ScopeInfo>>> Scopes(CancellationToken ct)
    {
        var result = new List<ScopeInfo>();
        foreach (var (scope, name, definition, use) in ScopeCatalogue)
        {
            var people = await _cache.GetAsync(scope, ct);
            result.Add(new ScopeInfo
            {
                Key = scope.ToString(), Name = name, Definition = definition,
                UseItFor = use, Count = people.Count
            });
        }
        return result;
    }

    private static readonly (Scope, string, string, string)[] ScopeCatalogue =
    {
        (Scope.All,       "All employee records",
                          "Every row on file, including past staff.",
                          "Record cleanup. Matches the HR system's Active and Ex-employee counts."),
        (Scope.HrActive,  "HR status Active",
                          "em_status = 'A'.",
                          "Matches the HR system's gender card."),
        (Scope.HrService, "HR status Active and in service",
                          "em_status = 'A' and em_service_status = 'V'.",
                          "Payroll, visas, contracts and documents. Matches the HR system's document cards."),
        (Scope.Attended,  "Active employees",
                          "Badged in at least once during the academic year.",
                          "Who actually works here."),
        (Scope.OnSite,    "On site recently",
                          "Badged within the last 20 school-open days.",
                          "Who is here now.")
    };

    [HttpGet]
    public async Task<ActionResult<OverviewResult>> Get([FromQuery] Scope scope = Scope.All,
                                                        CancellationToken ct = default)
    {
        var people = await _cache.GetAsync(scope, ct);
        var scopes = await Scopes(ct);

        return new OverviewResult
        {
            Scope  = (scopes.Value ?? new()).FirstOrDefault(s => s.Key == scope.ToString()) ?? new(),
            Scopes = scopes.Value ?? new(),
            Cards  = _builder.Build(people)
        };
    }

    [HttpGet("year")]
    public async Task<ActionResult<AcademicYearInfo>> Year(CancellationToken ct)
    {
        var year = await _repo.GetAcademicYearAsync(ct);
        return year is null ? NotFound("No academic year is marked current.") : year;
    }
}
