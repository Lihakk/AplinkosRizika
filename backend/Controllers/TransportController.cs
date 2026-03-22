using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

[ApiController]
[Route("api/[controller]")]
public class TransportController : ControllerBase
{
    private readonly AppDbContext _db;

    public TransportController(AppDbContext db)
    {
        _db = db;
    }

    public class BusStopDto
    {
        public long Id { get; set; }
        public string? Name { get; set; }
        public string? Routes { get; set; }
        public string? Geometry { get; set; }
    }

    public class ArrivalDto {
        [JsonPropertyName("route")]
        public string Route { get; set; }
        
        [JsonPropertyName("destination")]
        public string Destination { get; set; }
        
        [JsonPropertyName("time")]
        public string Time { get; set; }
        
        [JsonPropertyName("shapeId")]
        public string ShapeId { get; set; } 
    }
    public class FrequencyDto {
        public string Hour { get; set; }
        public int Count { get; set; }
    }
    
    [HttpGet("nearby-stops")]
    public async Task<IActionResult> GetNearbyStops([FromQuery] double lat, [FromQuery] double lon)
    {
        var query = @"
            SELECT 
                osm_id AS ""Id"", 
                name AS ""Name"", 
                COALESCE(ref, 'Nėra informacijos') AS ""Routes"", 
                ST_AsGeoJSON(ST_Transform(way, 4326)) AS ""Geometry""
            FROM planet_osm_point
            WHERE highway = 'bus_stop' 
            AND ST_DWithin(
                ST_Transform(way, 4326)::geography, 
                ST_SetSRID(ST_MakePoint({0}, {1}), 4326)::geography, 
                750
            )
            LIMIT 100;";

        try {
            var stops = await _db.Database.SqlQueryRaw<BusStopDto>(query, lon, lat).ToListAsync();
            return Ok(stops);
        } catch (Exception ex) {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    [HttpGet("stop-arrivals")]
    public async Task<IActionResult> GetStopArrivals([FromQuery] double lat, [FromQuery] double lon)
    {
        var now = DateTime.Now;
        string currentTime = now.ToString("HH:mm:ss");
        string todayDate = now.ToString("yyyyMMdd");
        string dayColumn = now.DayOfWeek.ToString().ToLower();

        string sql = @"
            WITH nearest_stop AS (
                SELECT stop_id FROM gtfs_stops 
                ORDER BY ST_Distance(
                    ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326)::geography, 
                    ST_SetSRID(ST_MakePoint({0}, {1}), 4326)::geography
                ) ASC LIMIT 1
            )
            SELECT 
                r.route_short_name AS ""Route"", 
                t.trip_headsign AS ""Destination"", 
                st.arrival_time AS ""Time"",
                t.shape_id AS ""ShapeId""
            FROM gtfs_stop_times st
            JOIN gtfs_trips t ON st.trip_id = t.trip_id
            JOIN gtfs_routes r ON t.route_id = r.route_id
            JOIN gtfs_calendar c ON t.service_id = c.service_id
            WHERE st.stop_id = (SELECT stop_id FROM nearest_stop)
              AND st.arrival_time > {2}
              AND {3} BETWEEN c.start_date AND c.end_date
              AND c." + dayColumn + @" = 1
            ORDER BY st.arrival_time ASC
            LIMIT 5;";

        return Ok(await _db.Database.SqlQueryRaw<ArrivalDto>(sql, lon, lat, currentTime, todayDate).ToListAsync());
    }

[HttpGet("route-path/{shapeId}")]
public async Task<IActionResult> GetRoutePath(string shapeId)
{
    var sql = @"
        SELECT ST_AsGeoJSON(ST_MakeLine(ST_SetSRID(ST_MakePoint(shape_pt_lon, shape_pt_lat), 4326) ORDER BY shape_pt_sequence)) AS ""Value""
        FROM gtfs_shapes 
        WHERE shape_id = {0}";
    try {
        var geoJson = await _db.Database.SqlQueryRaw<string>(sql, shapeId).FirstOrDefaultAsync();
        
        if (string.IsNullOrEmpty(geoJson)) return NotFound();

        return Ok(new { geometry = geoJson });
    } catch (Exception ex) {
        return StatusCode(500, new { message = ex.Message });
    }
}

[HttpGet("stop-routes")]

public async Task<IActionResult> GetStopRoutes([FromQuery] double lat, [FromQuery] double lon)
{

    string sql = @"
        WITH nearest_stop AS (
            SELECT stop_id FROM gtfs_stops 
            ORDER BY ST_Distance(
                ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326)::geography, 
                ST_SetSRID(ST_MakePoint({0}, {1}), 4326)::geography
            ) ASC LIMIT 1
        )
        SELECT 
            r.route_short_name AS ""Route"", 
            MAX(t.trip_headsign) AS ""Destination"", -- Just pick one destination for the label
            '' AS ""Time"", 
            '' AS ""ShapeId""
        FROM gtfs_stop_times st
        JOIN gtfs_trips t ON st.trip_id = t.trip_id
        JOIN gtfs_routes r ON t.route_id = r.route_id
        WHERE st.stop_id = (SELECT stop_id FROM nearest_stop)
        GROUP BY r.route_short_name
        ORDER BY 
            CASE WHEN r.route_short_name ~ '^\d+$' THEN r.route_short_name::integer ELSE 999 END, 
            r.route_short_name ASC;";

    var routes = await _db.Database.SqlQueryRaw<ArrivalDto>(sql, lon, lat).ToListAsync();
    return Ok(routes);
}


[HttpGet("stop-frequency")]
public async Task<IActionResult> GetStopFrequency([FromQuery] double lat, [FromQuery] double lon)
{
    var now = DateTime.Now;
    string todayDate = now.ToString("yyyyMMdd");
    string dayColumn = now.DayOfWeek.ToString().ToLower();

    string sql = @"
        WITH nearest_stop AS (
            SELECT stop_id FROM gtfs_stops 
            ORDER BY ST_Distance(
                ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326)::geography, 
                ST_SetSRID(ST_MakePoint({0}, {1}), 4326)::geography
            ) ASC LIMIT 1
        )
        SELECT 
            SUBSTRING(st.arrival_time, 1, 2) AS ""Hour"", 
            COUNT(*) AS ""Count""
        FROM gtfs_stop_times st
        JOIN gtfs_trips t ON st.trip_id = t.trip_id
        JOIN gtfs_calendar c ON t.service_id = c.service_id
        WHERE st.stop_id = (SELECT stop_id FROM nearest_stop)
          AND {2} BETWEEN c.start_date AND c.end_date
          AND c." + dayColumn + @" = 1
        GROUP BY ""Hour""
        ORDER BY ""Hour"" ASC;";

    try {
        var frequency = await _db.Database
            .SqlQueryRaw<FrequencyDto>(sql, lon, lat, todayDate)
            .ToListAsync();
        return Ok(frequency);
    } catch (Exception ex) {
        return StatusCode(500, new { message = ex.Message });
    }
}


}