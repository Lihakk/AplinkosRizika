using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;


public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<Eldership> Elderships { get; set; }
    public DbSet<Crimegrid> Crimegrids { get; set; }
    public DbSet<School> Schools { get; set; }
    public DbSet<Police> PoliceStations { get; set; }
    public DbSet<CrimeByEldership> CrimeByEldership { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {    
        modelBuilder.Entity<Eldership>(entity =>
        {
            entity.ToTable("elderships");

            entity.HasKey(e => e.Eldership_Id);

            entity.Property(e => e.Eldership_Id).HasColumnName("eldership_id");
            entity.Property(e => e.City_Id).HasColumnName("city_id");
            entity.Property(e => e.Eldership_Name).HasColumnName("eldership_name");
            entity.Property(e => e.Geometry).HasColumnName("geometry");
        });

        modelBuilder.Entity<Crimegrid>(entity =>
        {
            entity.ToTable("crime_grid");

            entity.HasKey(e => e.Id);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.City_id).HasColumnName("city_id");
            entity.Property(e => e.Year).HasColumnName("year");
            entity.Property(e => e.Health).HasColumnName("crimes_health");
            entity.Property(e => e.Theft).HasColumnName("crimes_theft");
            entity.Property(e => e.Total).HasColumnName("crimes_total_recalculated");

            entity.Property(e => e.Geometry).HasColumnName("geometry");
        });

        modelBuilder.Entity<CrimeByEldership>(entity =>
        {
            entity.HasNoKey();
            entity.ToView(null); 
        });

        modelBuilder.Entity<School>(entity =>
        {
            entity.HasNoKey();
            entity.ToView(null);

            
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Rating).HasColumnName("rating");
            entity.Property(e => e.Location).HasColumnName("location");
            entity.Property(e => e.City_Id).HasColumnName("city_id");
            entity.Property(e => e.Type).HasColumnName("tipas");
            entity.Property(e => e.School_Id).HasColumnName("school_id");
        });

        modelBuilder.Entity<Police>(entity =>
        {
            entity.HasNoKey();
            entity.ToView(null);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Point).HasColumnName("point");
        });
    }
}
