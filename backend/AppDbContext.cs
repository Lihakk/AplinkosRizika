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
            entity.Property(e => e.Eldership_Code).HasColumnName("eldership_code");
            entity.Property(e => e.Eldership_Name).HasColumnName("eldership_name");
            entity.Property(e => e.Geometry).HasColumnName("geometry");
        });

        modelBuilder.Entity<Crimegrid>(entity =>
        {
            entity.ToTable("crime_grid");

            entity.HasKey(e => e.Id);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Grid_id).HasColumnName("grid_id");
            entity.Property(e => e.Eldership_id).HasColumnName("eldership_id");
            entity.Property(e => e.Asm_2022).HasColumnName("asm_2022");
            entity.Property(e => e.Trv_2022).HasColumnName("trv_2022");
            entity.Property(e => e.Vtp_2022).HasColumnName("vtp_2022");
            entity.Property(e => e.Esm_2022).HasColumnName("esm_2022");
            entity.Property(e => e.Kit_2022).HasColumnName("kit_2022");
            entity.Property(e => e.Population_2020).HasColumnName("population_2020");
            entity.Property(e => e.Geometry).HasColumnName("geometry");
        });

        modelBuilder.Entity<CrimeByEldership>(entity =>
        {
            entity.HasNoKey();
            entity.ToView(null); // tells EF this is not a real table/view
        });

        modelBuilder.Entity<School>(entity =>
        {
            entity.HasNoKey();
            entity.ToView(null);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Point).HasColumnName("point");
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
