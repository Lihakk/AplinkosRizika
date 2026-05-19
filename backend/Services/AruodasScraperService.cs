using PuppeteerSharp;
using HtmlAgilityPack;
using Npgsql;
using Dapper;

public class AruodasScraperService
{
    private readonly string _connectionString;
    private readonly GeocodingService _geocodingService;

    public AruodasScraperService(IConfiguration configuration, GeocodingService geocodingService)
    {
        _connectionString = configuration.GetConnectionString("Postgres");
        _geocodingService = geocodingService;
    }

    public async Task ScrapeAruodas(string city)
    {
        var browserFetcher = new BrowserFetcher();
        await browserFetcher.DownloadAsync();

        await using var browser = await Puppeteer.LaunchAsync(new LaunchOptions 
        { 
            Headless = true,
            Args = new[] { "--no-sandbox", "--disable-setuid-sandbox" } // Saugesniam veikimui serveryje
        });


        await using var page = await browser.NewPageAsync();
        
        await page.SetUserAgentAsync("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

        try 
        {
            // Keliaujame į puslapį
            await page.GoToAsync($"https://www.aruodas.lt/butu-nuoma/{city.ToLower()}/", new NavigationOptions { WaitUntil = new[] { WaitUntilNavigation.Networkidle2 } });
            
            // Nedidelė pauzė papildomam saugumui
            await Task.Delay(10000);

            var content = await page.GetContentAsync();
            var doc = new HtmlDocument();
            doc.LoadHtml(content);

            var nodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'list-row-v2')]");
            if (nodes == null) return;

            using var connection = new NpgsqlConnection(_connectionString);

            foreach (var node in nodes)
            {
                var address = node.SelectSingleNode(".//div[contains(@class, 'list-adress-v2')]/h3/a")?.InnerText.Trim().Replace("\n", " ");
                var link = node.SelectSingleNode(".//div[contains(@class, 'list-adress-v2')]/h3/a")?.GetAttributeValue("href", "");
                var img = node.SelectSingleNode(".//img")?.GetAttributeValue("src", "");
                var priceText = node.SelectSingleNode(".//span[@class='list-item-price-v2']")?.InnerText.Trim() ?? "0";
                
                if (string.IsNullOrEmpty(address) || string.IsNullOrEmpty(link)) continue;

                // Geocoding
                var coords = await _geocodingService.GetCoordinatesAsync(address);
                if (coords == null) continue;

                // Kainos išvalymas iš teksto
                decimal price = 0;
                var digitsOnly = new string(priceText.Where(char.IsDigit).ToArray());
                if (!string.IsNullOrEmpty(digitsOnly)) price = decimal.Parse(digitsOnly);

                string sql = @"
                    INSERT INTO RealEstateListings (name, price, url, image_url, location)
                    VALUES (@Name, @Price, @Url, @Img, ST_SetSRID(ST_Point(@Lon, @Lat), 4326))
                    ON CONFLICT (url) DO UPDATE SET price = @Price;";

                await connection.ExecuteAsync(sql, new { 
                    Name = address, Price = price, Url = link, Img = img,
                    Lat = coords.Value.lat, Lon = coords.Value.lon 
                });

                await Task.Delay(10000);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Scraping klaida: {ex.Message}");
        }
    }
}