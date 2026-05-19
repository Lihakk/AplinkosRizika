using Microsoft.EntityFrameworkCore;
using Npgsql;
DotNetEnv.Env.Load();
var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var localPassword = Environment.GetEnvironmentVariable("DB_PASSWORD");

var connectionString = builder.Configuration.GetConnectionString("Postgres");


if (!string.IsNullOrEmpty(localPassword))
{
    var dbBuilder = new NpgsqlConnectionStringBuilder(connectionString)
    {
        Password = localPassword
    };
    connectionString = dbBuilder.ConnectionString;
}

builder.Services.AddControllers();
builder.Services.AddHttpClient<GeocodingService>();
builder.Services.AddScoped<AruodasScraperService>();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString, x => x.UseNetTopologySuite()));

// OpenAPI / Swagger

builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors("AllowAll");

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
