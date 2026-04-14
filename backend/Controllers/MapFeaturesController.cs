using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;


public class MapFeatureDto
{
    public long Id { get; set; }
    public string? Name { get; set; }
    public string? Type { get; set; } // e.g., 'pharmacy', 'park', 'supermarket'
    public string? Geometry { get; set; } // GeoJSON (Point or Polygon)
}
public class NearestFeatureDto
{
    public string? Type { get; set; }
    public string? Name { get; set; }
    public double Distance { get; set; } // Distance in meters
    public string? Icon { get; set; }
}

public class AccessibilityScoreDto
{
    public int TotalScore { get; set; } // 0 to 100
    public List<NearestFeatureDto> Features { get; set; } = new();
}

[ApiController]
[Route("api/[controller]")]
public class MapFeaturesController : ControllerBase
{
    private readonly AppDbContext _db;

    public MapFeaturesController(AppDbContext db)
    {
        _db = db;
    }

private string GetOsmQuery(string condition)
    {
        return $@"
            SELECT 
                osm_id AS ""Id"", 
                COALESCE(name, 
                    CASE 
                        WHEN leisure = 'playground' THEN 'Žaidimų aikštelė'
                        WHEN leisure IN ('park', 'nature_reserve', 'garden') THEN 'Parkas / Žalioji zona'
                        WHEN amenity = 'fuel' THEN 'Degalinė'
                        WHEN amenity = 'pharmacy' THEN 'Vaistinė'
                        WHEN amenity IN ('hospital', 'clinic', 'doctors') THEN 'Gydymo įstaiga'
                        WHEN shop IS NOT NULL THEN 'Parduotuvė'
                        WHEN leisure IN ('sports_centre', 'fitness_centre') THEN 'Sporto klubas'
                        ELSE 'Objektas'
                    END
                ) AS ""Name"", 
                COALESCE(amenity, leisure, shop, landuse, 'unknown') AS ""Type"", 
                ST_AsGeoJSON(ST_Transform(way, 4326)) AS ""Geometry""
            FROM planet_osm_point
            WHERE {condition}
            AND ST_DWithin(
                ST_Transform(way, 4326)::geography, 
                ST_SetSRID(ST_MakePoint({{0}}, {{1}}), 4326)::geography, 
                {{2}}
            )
            UNION ALL
            SELECT 
                osm_id AS ""Id"", 
                COALESCE(name, 
                    CASE 
                        WHEN leisure = 'playground' THEN 'Žaidimų aikštelė'
                        WHEN leisure IN ('park', 'nature_reserve', 'garden') THEN 'Parkas / Žalioji zona'
                        WHEN amenity = 'fuel' THEN 'Degalinė'
                        WHEN amenity = 'pharmacy' THEN 'Vaistinė'
                        WHEN amenity IN ('hospital', 'clinic', 'doctors') THEN 'Gydymo įstaiga'
                        WHEN shop IS NOT NULL THEN 'Parduotuvė'
                        WHEN leisure IN ('sports_centre', 'fitness_centre') THEN 'Sporto klubas'
                        ELSE 'Objektas'
                    END
                ) AS ""Name"", 
                COALESCE(amenity, leisure, shop, landuse, 'unknown') AS ""Type"", 
                ST_AsGeoJSON(ST_Transform(way, 4326)) AS ""Geometry""
            FROM planet_osm_polygon
            WHERE {condition}
            AND ST_DWithin(
                ST_Transform(way, 4326)::geography, 
                ST_SetSRID(ST_MakePoint({{0}}, {{1}}), 4326)::geography, 
                {{2}}
            )
            LIMIT 100;";
    }
    // PVP-71: Vaistinių ir ligoninių vaizdavimas (Pharmacies & Hospitals)
    [HttpGet("health-facilities")]
    public async Task<IActionResult> GetHealthFacilities([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 2000)
    {
        var condition = "amenity IN ('pharmacy', 'hospital', 'clinic', 'doctors')";
        var query = GetOsmQuery(condition);

        try {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    // PVP-44: Žaidimų aikštelių žemėlapis (Playgrounds)
    [HttpGet("playgrounds")]
    public async Task<IActionResult> GetPlaygrounds([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 1000)
    {
        var condition = "leisure = 'playground'";
        var query = GetOsmQuery(condition);

        try {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    // PVP-43: Žaliųjų zonų/parkų išryškinimas (Green zones & Parks)
    [HttpGet("parks")]
    public async Task<IActionResult> GetParks([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 2000)
    {
        var condition = "leisure IN ('park', 'nature_reserve', 'garden')";
        var query = GetOsmQuery(condition);

        try {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    // PVP-73: Parduotuvių žemėlapis (Shops & Supermarkets)
    [HttpGet("shops")]
    public async Task<IActionResult> GetShops([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 1500)
    {
        var condition = "shop IN ('supermarket', 'convenience', 'mall', 'bakery', 'grocery')";
        var query = GetOsmQuery(condition);

        try {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    // PVP-74: Degalinių žemėlapis (Gas Stations)
    [HttpGet("gas-stations")]
    public async Task<IActionResult> GetGasStations([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 3000)
    {
        var condition = "amenity = 'fuel'";
        var query = GetOsmQuery(condition);

        try {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    // PVP-69: Sporto klubų filtras/žemėlapis (Sports Clubs)
    [HttpGet("sports-clubs")]
    public async Task<IActionResult> GetSportsClubs([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 3000)
    {
        var condition = "leisure IN ('sports_centre', 'fitness_centre')";
        var query = GetOsmQuery(condition);

        try {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }
    [HttpGet("evaluation")]
    public async Task<IActionResult> GetAccessibilityEvaluation([FromQuery] double lat, [FromQuery] double lon)
    {
        var features = new List<NearestFeatureDto>();

    async Task FindNearest(string type, string icon, string condition)
        {
            var sql = $@"
                SELECT 
                    '{type}' AS ""Type"",
                    COALESCE(name, 'Nežinomas objektas') AS ""Name"",
                    ST_Distance(
                        ST_Transform(way, 4326)::geography, 
                        ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326)::geography
                    ) AS ""Distance"",
                    '{icon}' AS ""Icon""
                FROM (
                    SELECT name, way FROM planet_osm_point WHERE {condition}
                    UNION ALL
                    SELECT name, way FROM planet_osm_polygon WHERE {condition}
                ) as combined
                -- Fast nearest neighbor sort using PostGIS bounding boxes
                ORDER BY way <-> ST_Transform(ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326), 3857)"; 

            try {
                var nearest = await _db.Database.SqlQueryRaw<NearestFeatureDto>(sql).FirstOrDefaultAsync();
                if (nearest != null) features.Add(nearest);
            } catch (Exception ex) { 
                Console.WriteLine($"Error finding {type}: {ex.Message}"); 
            }
        }


        await FindNearest("Parkas", "🌳", "leisure IN ('park', 'nature_reserve', 'garden')");
        await FindNearest("Parduotuvė", "🛒", "shop IS NOT NULL");
        await FindNearest("Žaidimų aikštelė", "🛝", "leisure = 'playground'");
        await FindNearest("Degalinė", "⛽", "amenity = 'fuel'");
        await FindNearest("Ligoninė / Vaistinė", "🏥", "amenity IN ('pharmacy', 'hospital', 'clinic')");


        int score = 100;
        foreach (var f in features)
        {
            if (f.Distance > 2000) score -= 20;
            else if (f.Distance > 1000) score -= 10;
            else if (f.Distance > 500) score -= 5;
        }

        return Ok(new AccessibilityScoreDto { 
            TotalScore = Math.Max(0, score), 
            Features = features.OrderBy(f => f.Distance).ToList() 
        });
    }
}