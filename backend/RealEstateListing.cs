public class RealEstateListing
{
    public int Id { get; set; }
    public string Name { get; set; } = ""; // Pvz: "2 kambarių butas Senamiestyje"
    public decimal Price { get; set; }
    public double Area { get; set; }
    public int Rooms { get; set; }
    public string ImageUrl { get; set; } = "";
    public string Url { get; set; } = ""; // Nuoroda į Aruodą
    public double Lat { get; set; }
    public double Lon { get; set; }
    public double Distance { get; set; } // Atstumas nuo vartotojo pasirinkto taško
}
