using HrDashboard.Api.Configuration;
using HrDashboard.Api.Data;
using HrDashboard.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<DashboardOptions>(
    builder.Configuration.GetSection(DashboardOptions.SectionName));

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ISqlRunner, SqlRunner>();
builder.Services.AddScoped<IHrRepository, HrRepository>();
builder.Services.AddScoped<EmployeeCache>();
builder.Services.AddSingleton<OverviewBuilder>();

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.PropertyNamingPolicy =
                         System.Text.Json.JsonNamingPolicy.CamelCase);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var origins = builder.Configuration
    .GetSection($"{DashboardOptions.SectionName}:CorsOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Fail loudly at startup rather than on the first request if there is no connection string.
_ = app.Services.GetRequiredService<ISqlRunner>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

// The front end is static files served from the same host, so there is no
// second server to run and no cross-origin setup in the simple case.
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }));

app.Run();
