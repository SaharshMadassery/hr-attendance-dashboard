namespace HrDashboard.Api.Configuration;

/// <summary>
/// The measurement rules the whole application depends on, in one place so
/// they can be justified rather than scattered as literals.
/// </summary>
public sealed class DashboardOptions
{
    public const string SectionName = "Dashboard";

    /// <summary>
    /// How many matched employees must be recorded on a date for it to count
    /// as a school-open day. Every attendance denominator rests on this.
    /// </summary>
    public int MinStaffOnSite { get; set; } = 8;

    /// <summary>
    /// How many school-open days a person may be unseen before their standing
    /// moves from "On site" to "Stopped attending". Counted in open days, not
    /// calendar days, so term breaks cannot turn regular staff into leavers.
    /// </summary>
    public int OnSiteOpenDays { get; set; } = 20;

    /// <summary>
    /// Minutes past midnight after which a first punch counts as late.
    /// 480 is 08:00. The comparison is strictly greater than.
    /// </summary>
    public int LateAfterMinutes { get; set; } = 480;

    public int CommandTimeoutSeconds { get; set; } = 60;

    /// <summary>Nothing in the source changes during a school day; caching keeps the UI quick.</summary>
    public int CacheSeconds { get; set; } = 300;

    public string[] CorsOrigins { get; set; } = Array.Empty<string>();
}
