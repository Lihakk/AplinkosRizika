using NetTopologySuite.Geometries;

public class School
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public string Point { get; set; } = default!;
}
