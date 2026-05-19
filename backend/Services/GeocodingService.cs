using System.Net.Http.Json;
using System.Text.Json.Serialization;

public class GeocodingService
{
    private readonly HttpClient _httpClient;

    public GeocodingService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.DefaultRequestHeaders.Add("User-Agent", "AplinkosRizika-App/1.0");
    }

    public async Task<(double lat, double lon)?> GetCoordinatesAsync(string address)
    {
        try
        {
            string query = Uri.EscapeDataString($"{address}, Lietuva");
            string url = $"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1";

            var results = await _httpClient.GetFromJsonAsync<NominatimResult[]>(url);
            if (results != null && results.Length > 0)
            {
                return (
                    double.Parse(results[0].Lat, System.Globalization.CultureInfo.InvariantCulture),
                    double.Parse(results[0].Lon, System.Globalization.CultureInfo.InvariantCulture)
                );
            }
        }
        catch { /* Log error */ }
        return null;
    }

    private class NominatimResult
    {
        [JsonPropertyName("lat")] public string Lat { get; set; }
        [JsonPropertyName("lon")] public string Lon { get; set; }
    }
}