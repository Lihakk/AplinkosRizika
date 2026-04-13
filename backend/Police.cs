using NetTopologySuite.Geometries;
using Microsoft.EntityFrameworkCore;

[Keyless]
public class Police
{
    public long Id { get; set; }
    public string? Name { get; set; }
    public string Point { get; set; } = default!;
}