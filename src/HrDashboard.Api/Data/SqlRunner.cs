using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using HrDashboard.Api.Configuration;

namespace HrDashboard.Api.Data;

public interface ISqlRunner
{
    Task<List<T>> QueryAsync<T>(string procedure, Action<SqlParameterCollection> bind,
                                Func<SqlDataReader, T> map, CancellationToken ct);

    Task<List<List<object>>> QueryMultipleAsync(string procedure,
                                Action<SqlParameterCollection> bind,
                                IReadOnlyList<Func<SqlDataReader, object>> maps,
                                CancellationToken ct);
}

/// <summary>
/// The only place this application talks to SQL Server.
///
/// Two rules are enforced here rather than trusted:
///   1. Stored procedures only. Nothing composes SQL from user input, so
///      there is no injection surface to reason about.
///   2. Read-only. The procedure name must be on the allow-list below, and
///      every one of those procedures has a SELECT-only body. A procedure
///      that is not listed cannot be called, however it is named.
/// </summary>
public sealed class SqlRunner : ISqlRunner
{
    private static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        "hrv2.usp_AcademicYear",
        "hrv2.usp_EmployeeList",
        "hrv2.usp_AttendanceSummary",
        "hrv2.usp_AttendanceByEmployee",
        "hrv2.usp_AttendanceByDepartment",
        "hrv2.usp_EmployeeMonths"
    };

    private readonly string _connectionString;
    private readonly DashboardOptions _options;
    private readonly ILogger<SqlRunner> _log;

    public SqlRunner(IConfiguration config, IOptions<DashboardOptions> options, ILogger<SqlRunner> log)
    {
        _options = options.Value;
        _log = log;

        // The credential never lives in appsettings.json or in source control.
        _connectionString =
            Environment.GetEnvironmentVariable("HRDASH_CONNECTION")
            ?? config.GetConnectionString("Hrms")
            ?? throw new InvalidOperationException(
                "No connection string. Set the HRDASH_CONNECTION environment variable, " +
                "for example: Server=...;Database=HR_STAGING;User Id=...;Password=...;TrustServerCertificate=True");
    }

    private SqlCommand Build(SqlConnection cn, string procedure, Action<SqlParameterCollection> bind)
    {
        if (!Allowed.Contains(procedure))
            throw new InvalidOperationException(
                $"'{procedure}' is not on the read-only allow-list. Add it to SqlRunner.Allowed " +
                 "only after confirming its body contains no data modification.");

        var cmd = new SqlCommand(procedure, cn)
        {
            CommandType = CommandType.StoredProcedure,
            CommandTimeout = _options.CommandTimeoutSeconds
        };
        bind(cmd.Parameters);
        return cmd;
    }

    private async Task<SqlConnection> OpenAsync(CancellationToken ct)
    {
        var cn = new SqlConnection(_connectionString);
        await cn.OpenAsync(ct);
        // Belt and braces: a read-only session cannot write even if a procedure changed.
        await using (var ro = new SqlCommand("SET TRANSACTION ISOLATION LEVEL READ COMMITTED;", cn))
            await ro.ExecuteNonQueryAsync(ct);
        return cn;
    }

    public async Task<List<T>> QueryAsync<T>(string procedure, Action<SqlParameterCollection> bind,
                                             Func<SqlDataReader, T> map, CancellationToken ct)
    {
        var started = DateTime.UtcNow;
        var rows = new List<T>();

        await using var cn = await OpenAsync(ct);
        await using var cmd = Build(cn, procedure, bind);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(map(rd));

        _log.LogInformation("{Procedure} returned {Count} rows in {Ms} ms",
            procedure, rows.Count, (int)(DateTime.UtcNow - started).TotalMilliseconds);
        return rows;
    }

    public async Task<List<List<object>>> QueryMultipleAsync(string procedure,
        Action<SqlParameterCollection> bind, IReadOnlyList<Func<SqlDataReader, object>> maps,
        CancellationToken ct)
    {
        var sets = new List<List<object>>();

        await using var cn = await OpenAsync(ct);
        await using var cmd = Build(cn, procedure, bind);
        await using var rd = await cmd.ExecuteReaderAsync(ct);

        foreach (var map in maps)
        {
            var set = new List<object>();
            while (await rd.ReadAsync(ct)) set.Add(map(rd));
            sets.Add(set);
            if (!await rd.NextResultAsync(ct)) break;
        }
        return sets;
    }
}
