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
                ""grid_id"",
                ""eldership_id"",
                ""asm_2022"",
                ""trv_2022"",
                ""vtp_2022"",
                ""esm_2022"",
                ""kit_2022"",
                ""population_2020"",
                ST_AsGeoJSON(ST_Transform(""geometry"", 4326)) AS ""geometry""
            FROM ""crime_grid""
        ")
        .Select(e => new {
            e.Id,
            e.Grid_id,
            e.Eldership_id,
            e.Asm_2022,
            e.Trv_2022,
            e.Vtp_2022,
            e.Esm_2022,
            e.Kit_2022,
            e.Population_2020,
            e.Geometry 
        })
        .ToListAsync();

        return Ok(data);
    }

    [HttpGet("by-eldership")]
    public async Task<IActionResult> GetCrimeGridByEldership()
    {
        var data = await _db.CrimeByEldership
            .FromSqlRaw(@"
                SELECT 
                    e.""eldership_id"" AS ""Eldership_Id"",
                    e.""eldership_name"" AS ""Eldership_Name"",
                    COALESCE(SUM(c.""asm_2022""), 0) AS ""Asm_Total"",
                    COALESCE(SUM(c.""trv_2022""), 0) AS ""Trv_Total"",
                    COALESCE(SUM(c.""vtp_2022""), 0) AS ""Vtp_Total"",
                    COALESCE(SUM(c.""esm_2022""), 0) AS ""Esm_Total"",
                    COALESCE(SUM(c.""kit_2022""), 0) AS ""Kit_Total"",
                    COALESCE(SUM(c.""population_2020""), 0) AS ""Population_Total"",
                    ST_AsGeoJSON(ST_Transform(e.""geometry"", 4326))::json AS ""Geometry""
                FROM ""elderships"" e
                LEFT JOIN ""crime_grid"" c
                    ON ST_Intersects(e.""geometry"", c.""geometry"")
                GROUP BY e.""eldership_id"", e.""eldership_name"", e.""geometry""
            ")
            .ToListAsync();

        return Ok(data);
    }
}
