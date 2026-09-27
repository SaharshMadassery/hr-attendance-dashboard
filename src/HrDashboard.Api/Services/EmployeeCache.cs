using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using HrDashboard.Api.Configuration;
using HrDashboard.Api.Data;
using HrDashboard.Api.Models;

namespace HrDashboard.Api.Services;

/// <summary>
/// The source is a nightly-ish reality: punches arrive continuously but the
/// employee master barely moves during a day. Caching the roster per scope
/// keeps the Overview responsive without holding stale data long enough to
/// mislead. Every entry states its own age to the caller.
/// </summary>
public sealed class EmployeeCache
{
    private readonly IHrRepository _repo;
    private readonly IMemoryCache _cache;
    private readonly DashboardOptions _opt;

    public EmployeeCache(IHrRepository repo, IMemoryCache cache, IOptions<DashboardOptions> opt)
    { _repo = repo; _cache = cache; _opt = opt.Value; }

    public async Task<List<Employee>> GetAsync(Scope scope, CancellationToken ct)
    {
        var key = $"employees:{scope}";
        if (_cache.TryGetValue(key, out List<Employee>? cached) && cached is not null)
            return cached;

        var people = await _repo.GetEmployeesAsync(scope, ct);
        _cache.Set(key, people, TimeSpan.FromSeconds(_opt.CacheSeconds));
        return people;
    }

    public void Clear()
    {
        foreach (Scope s in Enum.GetValues<Scope>())
            _cache.Remove($"employees:{s}");
    }
}
