using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.IO;

[ApiController]
[Route("api/[controller]")]
public class CrimegridController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GeoJsonWriter _writer = new GeoJsonWriter();

    public CrimegridController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetCrimeGrid()
    {
        var data = await _db.Crimegrids
        .FromSqlRaw(@"
            SELECT 
                ""id"",
                ""year"",
                ""city_id"",
                ""crimes_health"",
                ""crimes_theft"",
                ""crimes_total_recalculated"",
                ST_AsGeoJSON(ST_Transform(""geometry"", 4326)) AS ""geometry""
            FROM ""crime_grid100""
        ")
        .Select(e => new {
            e.Id,
            e.Year,
            e.City_id,
            e.Health,
            e.Theft,
            e.Total,
            e.Geometry 
        })
        .ToListAsync();

        return Ok(data);
    }

    [HttpGet("by-eldership")]
    public async Task<IActionResult> GetCrimeGridByEldership([FromQuery] int? cityId = null)
    {
        var baseSql = @"
                SELECT 
                    e.""eldership_id"" AS ""Eldership_Id"",
                    e.""eldership_name"" AS ""Eldership_Name"",
                    COALESCE(SUM(c.""crimes_health""), 0) AS ""Health_Total"",
                    COALESCE(SUM(c.""crimes_theft""), 0) AS ""Theft_Total"",
                    COALESCE(SUM(c.""crimes_total_recalculated""), 0) AS ""All_Total"",
                    ST_AsGeoJSON(ST_Transform(e.""geometry"", 4326))::json AS ""Geometry"",
                    e.""city_id"" AS ""City_id""

                FROM ""elderships"" e

                LEFT JOIN ""grid_cells_100"" g
                    ON ST_Intersects(e.""geometry"", g.""geometry"")
                    AND e.""city_id"" = g.""city_id""

                LEFT JOIN ""crime_grid100"" c
                    ON c.""id"" = g.""id""

                WHERE c.""period"" = 'M'
                AND c.""year"" = 2025";

        var sql = baseSql;
        if (cityId.HasValue)
        {
            sql += @" AND e.""city_id"" = {0}";
        }
        sql += @"

                GROUP BY e.""eldership_id"", e.""eldership_name"", e.""geometry""";

        var data = cityId.HasValue
            ? await _db.CrimeByEldership.FromSqlRaw(sql, cityId.Value).ToListAsync()
            : await _db.CrimeByEldership.FromSqlRaw(sql).ToListAsync();

        return Ok(data);
    }
}
