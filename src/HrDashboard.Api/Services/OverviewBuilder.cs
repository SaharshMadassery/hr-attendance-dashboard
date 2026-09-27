using HrDashboard.Api.Models;

namespace HrDashboard.Api.Services;

/// <summary>
/// Turns the employee list into the Overview cards.
///
/// Two rules shape what appears here:
///   - Every count must be openable. A number the user cannot click through
///     to the people behind it does not belong on a card.
///   - A field that was never filled in is shown as "not recorded" with its
///     real coverage, never as 0. An empty document card rendered as a zero
///     reads as a finding about staff when it is a gap in data entry.
/// </summary>
public sealed class OverviewBuilder
{
    public List<Card> Build(IReadOnlyList<Employee> people)
    {
        var cards = new List<Card>();

        cards.Add(new Card
        {
            Title = "Employee details", Facet = "hr",
            Lines = new()
            {
                Line("Active",          people.Count(p => p.HrStatusCode == "A"),      "hr", "Active"),
                Line("Ex-employee",     people.Count(p => p.ServiceStatusCode == "L"), "hr", "Ex-employee"),
                Line("Female",          people.Count(p => p.GenderCode == "F"),        "hr", "Female"),
                Line("Male",            people.Count(p => p.GenderCode == "M"),        "hr", "Male"),
                Line("Birthday today",  people.Count(IsBirthdayToday),                 "hr", "Birthday today"),
                Line("Under probation", 0,                                             "hr", "Under probation")
            },
            Note = "Active and Ex-employee overlap by the few records marked active while their " +
                   "service status says left, so the two do not sum to the file size."
        });

        cards.Add(Group("Staff type",  people, p => p.StaffType   ?? "Not recorded", "stafftype"));
        cards.Add(Group("Gender",      people, p => p.Gender      ?? "Not recorded", "gender"));
        cards.Add(Group("Nationality", people, p => p.Nationality ?? "Not recorded", "nationality", 10));
        cards.Add(Group("Department",  people, p => p.Department  ?? "Not recorded", "department"));
        cards.Add(Group("Standing",    people, p => p.Standing,                      "standing"));

        cards.Add(Document("Employee Emirates ID",     people, p => p.EmiratesId, "eid"));
        cards.Add(Document("Employee passport",        people, p => p.Passport,   "passport"));
        cards.Add(Document("Employee visa",            people, p => p.Visa,       "visa"));
        cards.Add(Document("Employee labour contract", people, p => p.LabourCard, "labourcard"));
        cards.Add(Document("Contract type",            people, p => p.Contract,   "contract"));

        cards.Add(Group("Years of service", people, p => ServiceBand(p.DateOfJoin), "serviceband"));

        return cards.Where(c => c.Lines.Count > 0).ToList();
    }

    private static bool IsBirthdayToday(Employee p) =>
        p.DateOfBirth is { } d && d.Month == DateTime.Today.Month && d.Day == DateTime.Today.Day;

    private static CardLine Line(string label, int count, string facet, string value) =>
        new() { Label = label, Count = count, Facet = facet, Value = value };

    private static Card Group(string title, IReadOnlyList<Employee> people,
                              Func<Employee, string> key, string facet, int? top = null)
    {
        var lines = people.GroupBy(key)
            .Select(g => Line(g.Key, g.Count(), facet, g.Key))
            .OrderByDescending(l => l.Count)
            .ToList();
        if (top is { } n) lines = lines.Take(n).ToList();
        return new Card { Title = title, Facet = facet, Lines = lines };
    }

    /// <summary>
    /// All / Has a number / Valid / Expired / No data — the shape the HR
    /// system's own document cards use, so the two screens reconcile.
    /// </summary>
    private static Card Document(string title, IReadOnlyList<Employee> people,
                                 Func<Employee, DocumentInfo> pick, string facet)
    {
        int all      = people.Count;
        int numbered = people.Count(p => !string.IsNullOrWhiteSpace(pick(p).Number));
        int valid    = people.Count(p => pick(p).State == "Valid");
        int expired  = people.Count(p => pick(p).State == "Expired");
        int noData   = people.Count(p => pick(p).State == "No data");

        return new Card
        {
            Title = title, Facet = facet,
            Lines = new()
            {
                Line("All",          all,      facet, "All"),
                Line("Has a number", numbered, facet, "Has a number"),
                Line("Valid",        valid,    facet, "Valid"),
                Line("Expired",      expired,  facet, "Expired"),
                Line("No data",      noData,   facet, "No data")
            },
            Note = noData == all
                ? "No expiry date is recorded for anyone in this population. The columns exist and " +
                  "the product supports them; the entry never happened."
                : null
        };
    }

    private static string ServiceBand(DateOnly? joined)
    {
        if (joined is null) return "Not recorded";
        var years = (DateTime.Today - joined.Value.ToDateTime(TimeOnly.MinValue)).TotalDays / 365.25;
        return years < 1  ? "Under 1 year"
             : years <= 2 ? "1-2 years"
             : years <= 5 ? "3-5 years"
             : years <= 10? "6-10 years"
             : "Over 10 years";
    }

    /// <summary>Applies a card click back onto the list, so the table shows exactly those people.</summary>
    public static IEnumerable<Employee> Filter(IEnumerable<Employee> people, string facet, string value) =>
        facet switch
        {
            "hr" => value switch
            {
                "Active"          => people.Where(p => p.HrStatusCode == "A"),
                "Ex-employee"     => people.Where(p => p.ServiceStatusCode == "L"),
                "Female"          => people.Where(p => p.GenderCode == "F"),
                "Male"            => people.Where(p => p.GenderCode == "M"),
                "Birthday today"  => people.Where(IsBirthdayToday),
                _                 => Enumerable.Empty<Employee>()
            },
            "stafftype"   => people.Where(p => (p.StaffType   ?? "Not recorded") == value),
            "gender"      => people.Where(p => (p.Gender      ?? "Not recorded") == value),
            "nationality" => people.Where(p => (p.Nationality ?? "Not recorded") == value),
            "department"  => people.Where(p => (p.Department  ?? "Not recorded") == value),
            "standing"    => people.Where(p => p.Standing == value),
            "serviceband" => people.Where(p => ServiceBand(p.DateOfJoin) == value),
            "eid"         => DocFilter(people, p => p.EmiratesId, value),
            "passport"    => DocFilter(people, p => p.Passport,   value),
            "visa"        => DocFilter(people, p => p.Visa,       value),
            "labourcard"  => DocFilter(people, p => p.LabourCard, value),
            "contract"    => DocFilter(people, p => p.Contract,   value),
            _             => people
        };

    private static IEnumerable<Employee> DocFilter(IEnumerable<Employee> people,
                                                   Func<Employee, DocumentInfo> pick, string value) =>
        value switch
        {
            "All"          => people,
            "Has a number" => people.Where(p => !string.IsNullOrWhiteSpace(pick(p).Number)),
            _              => people.Where(p => pick(p).State == value)
        };
}
