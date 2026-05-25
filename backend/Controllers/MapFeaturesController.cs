using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

public class MapFeatureDto
{
    public long Id { get; set; }
    public string? Name { get; set; }
    public string? Type { get; set; }
    public string? Geometry { get; set; }
    public double Distance { get; set; }
}

public class NearestFeatureDto
{
    public string? Type { get; set; }
    public string? Name { get; set; }
    public double Distance { get; set; }
    public string? Icon { get; set; }
    public int Score { get; set; }
    public string? RangeLabel { get; set; }
    public double LimitMeters { get; set; }
}

public class AccessibilityScoreDto
{
    public int TotalScore { get; set; }
    public List<NearestFeatureDto> Features { get; set; } = new();
}

[ApiController]
[Route("api/[controller]")]
public class MapFeaturesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;

    public MapFeaturesController(AppDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    private sealed class EvaluationTarget
    {
        public required string Type { get; init; }
        public required string Icon { get; init; }
        public required string Condition { get; init; }
        public double IdealMeters { get; init; }
        public double LimitMeters { get; init; }
    }

    private static readonly EvaluationTarget[] EvaluationTargets =
    [
        new() { Type = "Parkas", Icon = "🌳", Condition = "leisure IN ('park', 'nature_reserve', 'garden')", IdealMeters = 500, LimitMeters = 1800 },
        new() { Type = "Parduotuvė", Icon = "🛒", Condition = "shop IS NOT NULL", IdealMeters = 400, LimitMeters = 1400 },
        new() { Type = "Žaidimų aikštelė", Icon = "🛝", Condition = "leisure = 'playground'", IdealMeters = 350, LimitMeters = 1200 },
        new() { Type = "Degalinė", Icon = "⛽", Condition = "amenity = 'fuel'", IdealMeters = 900, LimitMeters = 3000 },
        new() { Type = "Sveikatos paslaugos", Icon = "🏥", Condition = "amenity IN ('pharmacy', 'hospital', 'clinic', 'doctors')", IdealMeters = 600, LimitMeters = 2200 },
        new() { Type = "Sportas", Icon = "🏋️", Condition = "leisure IN ('sports_centre', 'fitness_centre')", IdealMeters = 800, LimitMeters = 2500 },
    ];

    private static string GetRangeLabel(double distance)
    {
        return distance switch
        {
            <= 300 => "iki 300 m",
            <= 750 => "300-750 m",
            <= 1500 => "750 m-1.5 km",
            <= 3000 => "1.5-3 km",
            _ => "virš 3 km"
        };
    }

    private static int ScoreDistance(double distance, double idealMeters, double limitMeters)
    {
        if (distance <= idealMeters) return 100;
        if (distance >= limitMeters) return 25;

        var ratio = (distance - idealMeters) / (limitMeters - idealMeters);
        return (int)Math.Round(100 - ratio * 75);
    }

    private static string OSMFallbackNameCaseSql()
    {
        return @"
            CASE
                WHEN leisure = 'playground' THEN 'Žaidimų aikštelė'
                WHEN leisure IN ('park', 'nature_reserve', 'garden') THEN 'Parkas / žalioji zona'
                WHEN amenity = 'fuel' THEN 'Degalinė'
                WHEN amenity = 'pharmacy' THEN 'Vaistinė'
                WHEN amenity IN ('hospital', 'clinic', 'doctors') THEN 'Gydymo įstaiga'
                WHEN shop IS NOT NULL THEN 'Parduotuvė'
                WHEN leisure IN ('sports_centre', 'fitness_centre') THEN 'Sporto klubas'
                ELSE 'Objektas'
            END";
    }

    private string GetOsmQuery(string condition)
    {
        var fallbackName = OSMFallbackNameCaseSql();
        return $@"
            WITH features AS (
                SELECT
                    osm_id AS ""Id"",
                    COALESCE(name, {fallbackName}) AS ""Name"",
                    COALESCE(amenity, leisure, shop, landuse, 'unknown') AS ""Type"",
                    ST_AsGeoJSON(ST_Transform(way, 4326)) AS ""Geometry"",
                    ST_Distance(
                        ST_Transform(way, 4326)::geography,
                        ST_SetSRID(ST_MakePoint({{0}}, {{1}}), 4326)::geography
                    ) AS ""Distance""
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
                    COALESCE(name, {fallbackName}) AS ""Name"",
                    COALESCE(amenity, leisure, shop, landuse, 'unknown') AS ""Type"",
                    ST_AsGeoJSON(ST_Transform(way, 4326)) AS ""Geometry"",
                    ST_Distance(
                        ST_Transform(way, 4326)::geography,
                        ST_SetSRID(ST_MakePoint({{0}}, {{1}}), 4326)::geography
                    ) AS ""Distance""
                FROM planet_osm_polygon
                WHERE {condition}
                AND ST_DWithin(
                    ST_Transform(way, 4326)::geography,
                    ST_SetSRID(ST_MakePoint({{0}}, {{1}}), 4326)::geography,
                    {{2}}
                )
            )
            SELECT ""Id"", ""Name"", ""Type"", ""Geometry"", ""Distance""
            FROM features
            ORDER BY ""Distance"" ASC
            LIMIT 120;";
    }

    [HttpGet("health-facilities")]
    public Task<IActionResult> GetHealthFacilities([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 2200)
    {
        return QueryFeatureLayer("amenity IN ('pharmacy', 'hospital', 'clinic', 'doctors')", lat, lon, radius);
    }

    [HttpGet("playgrounds")]
    public Task<IActionResult> GetPlaygrounds([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 1400)
    {
        return QueryFeatureLayer("leisure = 'playground'", lat, lon, radius);
    }

    [HttpGet("parks")]
    public Task<IActionResult> GetParks([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 2200)
    {
        return QueryFeatureLayer("leisure IN ('park', 'nature_reserve', 'garden')", lat, lon, radius);
    }

    [HttpGet("shops")]
    public Task<IActionResult> GetShops([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 1600)
    {
        return QueryFeatureLayer("shop IN ('supermarket', 'convenience', 'mall', 'bakery', 'grocery')", lat, lon, radius);
    }

    [HttpGet("gas-stations")]
    public Task<IActionResult> GetGasStations([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 3200)
    {
        return QueryFeatureLayer("amenity = 'fuel'", lat, lon, radius);
    }

    [HttpGet("sports-clubs")]
    public Task<IActionResult> GetSportsClubs([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 2800)
    {
        return QueryFeatureLayer("leisure IN ('sports_centre', 'fitness_centre')", lat, lon, radius);
    }

    [HttpGet("real-estate")]
    public async Task<IActionResult> GetRealEstate([FromQuery] double lat, [FromQuery] double lon, [FromQuery] int radius = 2500)
    {
        const string query = @"
            SELECT
                id AS ""Id"",
                name AS ""Name"",
                'listing' AS ""Type"",
                ST_AsGeoJSON(location::geometry) AS ""Geometry"",
                ST_DistanceSphere(location::geometry, ST_SetSRID(ST_Point({0}, {1}), 4326)) AS ""Distance""
            FROM RealEstateListings
            WHERE ST_DistanceSphere(location::geometry, ST_SetSRID(ST_Point({0}, {1}), 4326)) <= {2}
            ORDER BY ""Distance"" ASC
            LIMIT 80;";

        try
        {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    private async Task<IActionResult> QueryFeatureLayer(string condition, double lat, double lon, int radius)
    {
        var query = GetOsmQuery(condition);

        try
        {
            var results = await _db.Database.SqlQueryRaw<MapFeatureDto>(query, lon, lat, radius).ToListAsync();
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    [HttpGet("evaluation")]
    public async Task<IActionResult> GetAccessibilityEvaluation([FromQuery] double lat, [FromQuery] double lon)
    {
        var cacheKey = $"map-features:evaluation:{Math.Round(lat, 4)}:{Math.Round(lon, 4)}";
        if (_cache.TryGetValue<AccessibilityScoreDto>(cacheKey, out var cached))
        {
            return Ok(cached);
        }

        var features = new List<NearestFeatureDto>();

        async Task FindNearest(EvaluationTarget target)
        {
            var sql = $@"
                WITH combined AS (
                    SELECT name, way FROM planet_osm_point WHERE {target.Condition}
                    UNION ALL
                    SELECT name, way FROM planet_osm_polygon WHERE {target.Condition}
                )
                SELECT
                    {{2}} AS ""Type"",
                    COALESCE(name, {{3}}) AS ""Name"",
                    ST_Distance(
                        ST_Transform(way, 4326)::geography,
                        ST_SetSRID(ST_MakePoint({{0}}, {{1}}), 4326)::geography
                    ) AS ""Distance"",
                    NULL::text AS ""Icon"",
                    0 AS ""Score"",
                    NULL::text AS ""RangeLabel"",
                    0::double precision AS ""LimitMeters""
                FROM combined
                ORDER BY ""Distance"" ASC
                LIMIT 1";

            try
            {
                var nearest = await _db.Database
                    .SqlQueryRaw<NearestFeatureDto>(sql, lon, lat, target.Type, $"Artimiausia vieta: {target.Type}")
                    .FirstOrDefaultAsync();

                if (nearest == null) return;

                nearest.Icon = target.Icon;
                nearest.Score = ScoreDistance(nearest.Distance, target.IdealMeters, target.LimitMeters);
                nearest.RangeLabel = GetRangeLabel(nearest.Distance);
                nearest.LimitMeters = target.LimitMeters;
                features.Add(nearest);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding {target.Type}: {ex.Message}");
            }
        }

        foreach (var target in EvaluationTargets)
        {
            await FindNearest(target);
        }

        var score = features.Count == 0
            ? 0
            : (int)Math.Round(features.Average(f => f.Score));

        var response = new AccessibilityScoreDto
        {
            TotalScore = Math.Clamp(score, 0, 100),
            Features = features.OrderBy(f => f.Distance).ToList()
        };

        _cache.Set(cacheKey, response, TimeSpan.FromMinutes(10));
        return Ok(response);
    }
}
