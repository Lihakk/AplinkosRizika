using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.IO;

[ApiController]
[Route("api/[controller]")]
public class EldershipController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GeoJsonWriter _writer = new GeoJsonWriter();

    public EldershipController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? cityId = null)
    {
    try
    {    
        var sql = @"
            SELECT 
                ""eldership_id"",
                ""eldership_name"",
                ST_AsGeoJSON(ST_Transform(""geometry"", 4326)) AS ""geometry""
            FROM ""elderships""";

        var data = cityId.HasValue
            ? await _db.Elderships
                .FromSqlRaw(sql + @" WHERE ""city_id"" = {0}", cityId.Value)
                .Select(e => new {
                    e.Eldership_Id,
                    e.Eldership_Name,
                    e.Geometry 
                })
                .ToListAsync()
            : await _db.Elderships
                .FromSqlRaw(sql)
                .Select(e => new {
                    e.Eldership_Id,
                    e.Eldership_Name,
                    e.Geometry 
                })
                .ToListAsync();

        return Ok(data);
        }catch (Exception ex)
    {
   return StatusCode(500, new { error = ex.Message, detail = ex.InnerException?.Message });
    }
    }
}
