using NetTopologySuite.Geometries;

public class Eldership
{
    public int Eldership_Id { get; set; }
    public int City_Id { get; set; }
    public required string Eldership_Code { get; set; }
    public required string Eldership_Name { get; set; }

    // PostGIS multipolygon
    public required string Geometry { get; set; }
}
