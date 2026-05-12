using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.IO;

[ApiController]
[Route("api/[controller]")]
public class SchoolController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GeoJsonWriter _writer = new GeoJsonWriter();

    public SchoolController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var data = await _db.Schools
        .FromSqlRaw(@"
            SELECT 
                ""name"",
                ""rating"",
                ST_AsGeoJSON(location) AS ""location"",
                ""city_id"",
                ""tipas"",
                ""school_id""
            FROM ""schools""
        ")
        .Select(s => new {
            s.Name,
            s.Rating,
            s.Location,
            s.City_Id,
            s.Type,
            s.School_Id,
        })
        .ToListAsync();

        return Ok(data);
    }
}
