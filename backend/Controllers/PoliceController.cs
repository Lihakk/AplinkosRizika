using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.IO;

[ApiController]
[Route("api/[controller]")]
public class PoliceController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GeoJsonWriter _writer = new GeoJsonWriter();

    public PoliceController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var data = await _db.PoliceStations
        .FromSqlRaw(@"
            SELECT 
                ""osm_id"" AS ""id"",
                ""name"",
                ST_AsGeoJSON(ST_Transform(""way"", 4326)) AS ""point""
            FROM ""planet_osm_point""
            Where ""amenity"" = 'police'
        ")
        .Select(s => new {
            s.Id,
            s.Name,
            s.Point
        })
        .ToListAsync();

        return Ok(data);
    }
}
