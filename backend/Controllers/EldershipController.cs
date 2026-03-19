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
    public async Task<IActionResult> GetAll()
    {
        var data = await _db.Elderships
        .FromSqlRaw(@"
            SELECT 
                ""eldership_id"",
                ""eldership_name"",
                ""eldership_code"",
                ST_AsGeoJSON(ST_Transform(""geometry"", 4326)) AS ""geometry""
            FROM ""elderships""
        ")
        .Select(e => new {
            e.Eldership_Id,
            e.Eldership_Name,
            e.Eldership_Code,
            e.Geometry 
        })
        .ToListAsync();

        return Ok(data);
    }
}
