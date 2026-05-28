# Diegimo diagrama

Ši schema aprašo `AplinkosRizika` diegimą viename „Oracle Cloud Infrastructure“ virtualiame serveryje, kuriame visi sistemos komponentai paleidžiami per Docker Compose.

```mermaid
flowchart TB
  user["Naudotojas<br/>Naršyklė"]
  internet["Internetas"]

  subgraph oci["Oracle Cloud Infrastructure"]
    subgraph vm["OCI Compute Instance<br/>Ubuntu / Docker host"]
      docker["Docker Engine + Docker Compose"]

      subgraph network["Docker Compose tinklas"]
        frontend["frontend konteineris<br/>React + Vite build<br/>Nginx<br/>host:80 -> container:80"]
        backend["backend konteineris<br/>ASP.NET Core Web API<br/>container:8080<br/>host:5000 -> container:8080"]
        db["postgres konteineris<br/>PostgreSQL + PostGIS<br/>kartoza/postgis:15<br/>host:5432 -> container:5432"]
        volume[("pgdata volume<br/>PostGIS, OSM, NT, mokyklų,<br/>transporto ir nusikalstamumo duomenys")]
      end
    end
  end

  subgraph external["Išoriniai duomenų šaltiniai / paslaugos"]
    aruodas["Aruodas.lt<br/>NT skelbimų rinkimas"]
    geocoding["Geokodavimo paslauga<br/>adresai -> koordinatės"]
    routing["Maršrutizavimo paslauga<br/>OSRM / OpenStreetMap routing"]
    tiles["Žemėlapio plytelės<br/>OpenStreetMap / CARTO"]
  end

  user --> internet
  internet -->|"HTTP :80"| frontend
  frontend -->|"REST API užklausos"| backend
  backend -->|"SQL / PostGIS užklausos"| db
  db --> volume

  backend -. "scraper / importas" .-> aruodas
  backend -. "adresų paieška" .-> geocoding
  frontend -. "maršrutų braižymas" .-> routing
  frontend -. "žemėlapio fonas" .-> tiles

  docker --> frontend
  docker --> backend
  docker --> db
```

## Komponentai

| Komponentas | Technologija | Paskirtis |
| --- | --- | --- |
| `frontend` | React, Vite, Nginx | Naudotojo sąsaja, žemėlapis, analizės puslapiai ir „Analytics Hub“. |
| `backend` | ASP.NET Core Web API | API sluoksnis, NT skelbimų apdorojimas, OSM / PostGIS užklausos, pasiekiamumo ir rekomendacijų skaičiavimai. |
| `postgres` | PostgreSQL + PostGIS | Erdviniai duomenys, OSM lentelės, seniūnijos, nusikalstamumas, mokyklos, transportas ir NT skelbimai. |
| `pgdata` | Docker volume | Nuolatinė duomenų saugykla, kad konteinerių perkūrimas neištrintų duomenų bazės. |

## Diegimo srautas

1. Naudotojas atidaro viešą OCI serverio adresą per `HTTP :80`.
2. `frontend` konteineris per Nginx pateikia sukompiliuotą React aplikaciją.
3. React aplikacija kviečia ASP.NET Core API endpointus.
4. `backend` konteineris jungiasi prie `postgres` konteinerio vidiniu Docker tinklo vardu `postgres`.
5. PostGIS vykdo erdvines užklausas: atstumus, artimiausius objektus, seniūnijų geometrijas ir OSM sluoksnius.
6. Duomenys grąžinami į frontendą kaip JSON ir vaizduojami žemėlapyje bei analitikos puslapiuose.

## Pastabos demonstracijai

- Viešai naudotojams reikalingas tik `frontend` portas `80`.
- `backend` portas pagal dabartinį `docker-compose.yml` yra `5000:8080`.
- `postgres` portas `5432` dabar yra publikuojamas hoste, bet produkciniame pristatyme saugiau jį laikyti pasiekiamą tik Docker tinkle arba riboti per OCI firewall taisykles.
- API ryšys tarp konteinerių vyksta per Docker Compose tinklą, todėl backend duomenų bazę pasiekia per `Host=postgres`.
