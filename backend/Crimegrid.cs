using NetTopologySuite.Geometries;

public class Crimegrid
{
    public int Id { get; set; }
    public int City_id { get; set; }
    public int Year { get; set; }
    public int Health { get; set; }
    public int Theft { get; set; }
    public int Total { get; set; }
    public string? Geometry { get; set; }
}
