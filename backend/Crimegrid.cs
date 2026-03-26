using NetTopologySuite.Geometries;

public class Crimegrid
{
    public int Id { get; set; }
    public int Grid_id { get; set; }
    public int Eldership_id { get; set; }
    public int Asm_2022 { get; set; }
    public int Trv_2022 { get; set; }
    public int Vtp_2022 { get; set; }
    public int Esm_2022 { get; set; }
    public int Kit_2022 { get; set; }
    public int Population_2020 { get; set; }

    // PostGIS multipolygon
    public required string Geometry { get; set; }
}
