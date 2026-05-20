using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

public class GeocodingService
{
    private readonly HttpClient _httpClient;

    public GeocodingService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.DefaultRequestHeaders.Add("User-Agent", "AplinkosRizika-App/1.0 (linasjancauskas@gmail.com)");
    }

    public async Task<(double lat, double lon)?> GetCoordinatesAsync(string query)
    {

        var url = $"https://photon.komoot.io/api/?q={Uri.EscapeDataString(query)}&limit=1";
        
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("User-Agent", "AplinkosRizikaApp/1.0"); 

        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        
        var features = document.RootElement.GetProperty("features");
        if (features.GetArrayLength() == 0) return null;

        // Photon returns coordinates as [lon, lat]
        var coordinates = features[0]
            .GetProperty("geometry")
            .GetProperty("coordinates");

        double lon = coordinates[0].GetDouble();
        double lat = coordinates[1].GetDouble();

        return (lat, lon);
    }

    private class NominatimResult
    {
        [JsonPropertyName("lat")] public string Lat { get; set; } = "";
        [JsonPropertyName("lon")] public string Lon { get; set; } = "";
    }
}
