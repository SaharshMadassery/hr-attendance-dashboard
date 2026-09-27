using System.Globalization;
using System.Text;

namespace HrDashboard.Api.Services;

/// <summary>
/// CSV that spreadsheets open without argument.
///
/// The export writes every row that matches the current filters, never only
/// the page on screen. A file that silently stopped at a display limit would
/// read as complete when it is not, which is worse than no export at all.
/// </summary>
public static class CsvExporter
{
    public static string Write<T>(IEnumerable<T> rows, IReadOnlyList<string> columns,
                                  Func<T, string, object?> value)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", columns.Select(Cell)));
        foreach (var row in rows)
            sb.AppendLine(string.Join(",", columns.Select(c => Cell(Format(value(row, c))))));
        return sb.ToString();
    }

    private static string Format(object? v) => v switch
    {
        null            => "",
        DateOnly d      => d.ToString("yyyy-MM-dd"),
        DateTime dt     => dt.ToString("yyyy-MM-dd HH:mm"),
        decimal m       => m.ToString(CultureInfo.InvariantCulture),
        double  d2      => d2.ToString(CultureInfo.InvariantCulture),
        bool b          => b ? "Yes" : "No",
        _               => v.ToString() ?? ""
    };

    private static readonly char[] NeedsQuoting = { ',', '"', '\n', '\r' };

    private static string Cell(string s) =>
        s.IndexOfAny(NeedsQuoting) >= 0
            ? "\"" + s.Replace("\"", "\"\"") + "\""
            : s;
}
