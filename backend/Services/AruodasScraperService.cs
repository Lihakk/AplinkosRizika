using System.Globalization;
using System.Text.RegularExpressions;
using Dapper;
using HtmlAgilityPack;
using Npgsql;
using PuppeteerSharp;

public class AruodasScraperService
{
    private static readonly Dictionary<string, string> CitySlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Kaunas"] = "kaune",
        ["Vilnius"] = "vilniuje",
        ["Klaipėda"] = "klaipedoje",
        ["Klaipeda"] = "klaipedoje",
    };

    private readonly string _connectionString;
    private readonly GeocodingService _geocodingService;

    public AruodasScraperService(IConfiguration configuration, GeocodingService geocodingService)
    {
        _connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Missing Postgres connection string.");
        _geocodingService = geocodingService;
        Console.WriteLine($"[DEBUG] Connection String is: {_connectionString}");
    }

    public async Task ScrapeAruodas(string city)
    {
        var citySlug = CitySlugs.GetValueOrDefault(city, city.ToLowerInvariant());
        
        var browserFetcher = new BrowserFetcher();
        await browserFetcher.DownloadAsync();

        await using var browser = await Puppeteer.LaunchAsync(new LaunchOptions
        {
            Headless = true,
            Args = ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        await using var page = await browser.NewPageAsync();
        await page.SetUserAgentAsync("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();

       var existingUrls = (await connection.QueryAsync<string>("SELECT url FROM RealEstateListings")).ToHashSet();
        Console.WriteLine($"Found {existingUrls.Count} existing listings in DB. Skipping duplicates.");

        try
        {
            int currentPage = 1;
            int maxPages = 15; 
            bool hasMorePages = true;

            while (hasMorePages && currentPage <= maxPages)
            {

                string targetUrl = currentPage == 1 
                    ? $"https://www.aruodas.lt/butu-nuoma/{citySlug}/" 
                    : $"https://www.aruodas.lt/butu-nuoma/{citySlug}/puslapis/{currentPage}/";

                Console.WriteLine($"\n--- Scraping Page {currentPage}: {targetUrl} ---");

                await page.GoToAsync(
                    targetUrl,
                    new NavigationOptions { WaitUntil = [WaitUntilNavigation.Networkidle2] }
                );

                // 3. Atsitiktinė pauzė (Anti-Bot apsaugos apėjimas)
                await Task.Delay(Random.Shared.Next(3000, 6000));

                var content = await page.GetContentAsync();
                var doc = new HtmlDocument();
                doc.LoadHtml(content);

                // 4. Randame visus skelbimų "kortelių" elementus
                var nodes = doc.DocumentNode.SelectNodes(
                    "//div[contains(concat(' ', normalize-space(@class), ' '), ' list-row-v2 ') or contains(concat(' ', normalize-space(@class), ' '), ' list-row ')]"
                );

                if (nodes == null || nodes.Count == 0)
                {
                    Console.WriteLine("No more listings found on this page. Ending scraping loop.");
                    break; // Išeiname iš While ciklo, nes skelbimų nebeliko
                }

                foreach (var node in nodes)
                {
                    // A. Nuoroda (URL)
                    var linkNode = node.SelectSingleNode(".//a[contains(@href, 'aruodas.lt') or starts-with(@href, '/butu')]");
                    var link = AbsoluteAruodasUrl(linkNode?.GetAttributeValue("href", ""));
                    
                    if (string.IsNullOrWhiteSpace(link)) continue;

                    // B. Apsauga nuo Dublikatų (Praleidžiame, jei jau turime DB)
                    if (existingUrls.Contains(link))
                    {
                        Console.WriteLine($"Skipped (Already in DB): {link}");
                        continue;
                    }

                    // C. Adresas
                    var address = ExtractAddress(node);
                    if (string.IsNullOrWhiteSpace(address)) continue;

                    // D. Kambarių skaičius (Rooms)
                    var roomNode = node.SelectSingleNode(".//div[contains(@class, 'list-RoomNum-v2')]");
                    int? rooms = null;
                    if (int.TryParse(roomNode?.InnerText?.Trim(), out int parsedRooms))
                    {
                        rooms = parsedRooms;
                    }

                    // E. Plotas (Area)
                    var areaNode = node.SelectSingleNode(".//div[contains(@class, 'list-AreaOverall-v2')]");
                    decimal? area = null;
                    var areaText = areaNode?.InnerText?.Replace("m²", "")?.Trim(); 
                    if (decimal.TryParse(areaText, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal parsedArea))
                    {
                        area = parsedArea;
                    }

                    // F. Geocoding (Kvieskime tik naujiems skelbimams!)
                    var coords = await _geocodingService.GetCoordinatesAsync($"{address}, {city}");
                    if (coords == null) 
                    {
                        Console.WriteLine($"Skipped: Could not find coordinates for '{address}'");
                        continue;
                    }

                    // G. Kiti laukai
                    var img = ExtractImage(node);
                    var price = ParsePrice(node);

                    Console.WriteLine($"NEW: {address} | Price: {price} | Rooms: {rooms} | Area: {area}m² | Lat: {coords.Value.lat}");

                    // 5. Išsaugojimas į Duomenų Bazę 
                    const string sql = @"
                        INSERT INTO RealEstateListings (name, price, rooms, area, url, image_url, location)
                        VALUES (@Name, @Price, @Rooms, @Area, @Url, @Img, ST_SetSRID(ST_Point(@Lon, @Lat), 4326))
                        ON CONFLICT (url) DO UPDATE
                        SET price = @Price,
                            rooms = @Rooms,
                            area = @Area,
                            image_url = COALESCE(NULLIF(@Img, ''), RealEstateListings.image_url),
                            location = ST_SetSRID(ST_Point(@Lon, @Lat), 4326);";

                    try 
                    {
                        await connection.ExecuteAsync(sql, new
                        {
                            Name = address,
                            Price = price,
                            Rooms = rooms,
                            Area = area,
                            Url = link,
                            Img = img,
                            Lat = coords.Value.lat,
                            Lon = coords.Value.lon
                        });
                        
                        // Pridedame į HashSet atmintyje, kad to paties skelbimo nebandytume pridėti dar kartą to paties kodo vykdymo metu
                        existingUrls.Add(link); 
                        Console.WriteLine($"SUCCESS: Saved {address}");
                    } 
                    catch (Exception ex) 
                    {
                        Console.WriteLine($"DB ERROR for {address}: {ex.Message}");
                    }

                    // Nedidelė pauzė po kiekvieno įrašo
                    await Task.Delay(500); 
                }

                currentPage++;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Aruodas scraping completely failed: {ex.Message}");
        }
    }

    private static string ExtractAddress(HtmlNode node)
    {
        var addressNode =
            node.SelectSingleNode(".//*[contains(@class, 'list-adress-v2')]//h3//a") ?? // Try to get just the clean link text first
            node.SelectSingleNode(".//*[contains(@class, 'list-adress-v2')]") ??
            node.SelectSingleNode(".//h3");

        var text = NormalizeWhitespace(addressNode?.InnerText ?? "");

        // 1. Cut off anything starting with "Prieš" (e.g., "Prieš 1 mėn.")
        var priceIndex = text.IndexOf("Prieš", StringComparison.OrdinalIgnoreCase);
        if (priceIndex > 0)
        {
            text = text.Substring(0, priceIndex);
        }

        // 2. Cut off anything starting with "kamb." or digits followed by €
        text = Regex.Replace(text, @"\s*\d+\s*kamb\..*$", "", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"\d+\s*€.*$", "", RegexOptions.IgnoreCase);

        // 3. Fix missing spaces between District and Street (e.g., "ŽaliakalnisK. Petrausko" -> "Žaliakalnis, K. Petrausko")
        // This adds a space between a lowercase letter and an uppercase letter
        text = Regex.Replace(text, @"([a-zžūįšęėįųy])([A-ZŽŪĮŠĘĖĮŲY])", "$1, $2");

        return text.Trim(' ', ',');
    }

    private static string ExtractImage(HtmlNode node)
    {
        var imageNode = node.SelectSingleNode(".//img");
        var url =
            imageNode?.GetAttributeValue("data-src", "") ??
            imageNode?.GetAttributeValue("data-original", "") ??
            imageNode?.GetAttributeValue("src", "") ??
            "";

        return url.StartsWith("//", StringComparison.Ordinal) ? $"https:{url}" : url;
    }

    private static string AbsoluteAruodasUrl(string? href)
    {
        if (string.IsNullOrWhiteSpace(href)) return "";
        if (href.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return href;
        if (href.StartsWith("/", StringComparison.Ordinal)) return $"https://www.aruodas.lt{href}";
        return $"https://www.aruodas.lt/{href.TrimStart('/')}";
    }

    private static decimal ParsePrice(HtmlNode node)
    {
        // Target the specific span that holds the price
        var priceNode = node.SelectSingleNode(".//*[contains(@class, 'list-item-price-v2')]") 
                    ?? node.SelectSingleNode(".//*[contains(@class, 'list-item-price')]")
                    ?? node.SelectSingleNode(".//*[contains(@class, 'price')]");

        if (priceNode == null) return 0;

        var text = priceNode.InnerText; // Looks like "680 €" or "680 € / mėn."
        
        // Grab only the main digits before the € sign
        var match = Regex.Match(text, @"([0-9][0-9\s]*)\s*€");
        if (!match.Success) return 0;

        // Remove empty spaces (e.g., "1 200" -> "1200")
        var normalized = Regex.Replace(match.Groups[1].Value, @"\s", "");
        
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var price)
            ? price
            : 0;
    }

    private static string NormalizeWhitespace(string text)
    {
        var decoded = HtmlEntity.DeEntitize(text);
        return Regex.Replace(decoded, @"\s+", " ").Trim();
    }
}
