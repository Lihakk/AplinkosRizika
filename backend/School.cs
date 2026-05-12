using NetTopologySuite.Geometries;
using Microsoft.EntityFrameworkCore;

[Keyless]
public class School
{
    public string? Name { get; set; }
    public double Rating { get; set; }
    public string Location { get; set; } = default!;
    public int City_Id { get; set; }
    public string Type { get; set; } = default!;
    public int School_Id { get; set; }
}
