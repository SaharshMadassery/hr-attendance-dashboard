using Microsoft.Data.SqlClient;

namespace HrDashboard.Api.Data;

/// <summary>Null-tolerant reads. Most columns in this source are sparsely filled.</summary>
public static class ReaderExtensions
{
    public static string?   Str(this SqlDataReader r, string c) => r[c] is DBNull ? null : (string?)r[c];
    public static int?      Int(this SqlDataReader r, string c) => r[c] is DBNull ? null : Convert.ToInt32(r[c]);
    public static decimal?  Dec(this SqlDataReader r, string c) => r[c] is DBNull ? null : Convert.ToDecimal(r[c]);
    public static DateTime? DateTimeOrNull(this SqlDataReader r, string c) => r[c] is DBNull ? null : Convert.ToDateTime(r[c]);

    public static DateOnly? DateOrNull(this SqlDataReader r, string c) =>
        r[c] is DBNull ? null : DateOnly.FromDateTime(Convert.ToDateTime(r[c]));

    /// <summary>
    /// Minutes past midnight rendered as HH:mm. The source truncates rather than
    /// rounds, and matching that is what reproduces the published averages.
    /// </summary>
    public static string? MinutesAsClock(this SqlDataReader r, string c)
    {
        if (r[c] is DBNull) return null;
        var m = Convert.ToInt32(r[c]);
        return $"{m / 60:D2}:{m % 60:D2}";
    }
}
