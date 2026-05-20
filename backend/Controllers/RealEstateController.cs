using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Dapper;


[ApiController]
[Route("api/[controller]")]
public class RealEstateController : ControllerBase
{
    private readonly string _connectionString;
    private readonly AruodasScraperService _scraper;

    public RealEstateController(IConfiguration configuration, AruodasScraperService scraper)
    {
        _connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Missing Postgres connection string.");
        _scraper = scraper;
    }

    [HttpGet("nearby")]
    public async Task<IActionResult> GetNearby(double lat, double lon, double radius = 2000)
    {
        using var conn = new NpgsqlConnection(_connectionString);
        string sql = @"
            SELECT name, price, url, image_url as ImageUrl,
                   ST_Y(location::geometry) as Lat, ST_X(location::geometry) as Lon,
                   ST_DistanceSphere(location::geometry, ST_SetSRID(ST_Point(@Lon, @Lat), 4326)) as Distance
            FROM RealEstateListings
            WHERE ST_DistanceSphere(location::geometry, ST_SetSRID(ST_Point(@Lon, @Lat), 4326)) <= @Radius
            ORDER BY Distance ASC LIMIT 10";

        var data = await conn.QueryAsync<RealEstateListing>(sql, new { Lat = lat, Lon = lon, Radius = radius });
        return Ok(data);
    }

    [HttpPost("scrape")]
    public IActionResult StartScrape(string city = "Kaunas")
    {
        _ = _scraper.ScrapeAruodas(city);
        return Ok("Scraping started...");
    }
}
