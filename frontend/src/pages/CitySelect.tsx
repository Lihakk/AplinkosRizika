import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bus, MapPin, School, Search, Shield } from "lucide-react";
import "./CitySelect.css";

const allCities = ["Kaunas", "Vilnius"].sort();

export default function CitySelect() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCities = allCities.filter((city) =>
    city.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#f4f6f2] text-[#15201c] font-sans">
      <nav className="fixed top-0 w-full z-50 bg-white/75 backdrop-blur-md border-b border-[#c5d3cc]/70">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#17211d] rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/10">
              <Shield className="text-white" size={24} />
            </div>
            <span className="text-xl font-black tracking-tight text-[#15201c]">
              AplinkosRizika
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-[#697a74]">
            <a href="#features" className="hover:text-[#176043] transition-colors">Galimybės</a>
            <a href="#search" className="hover:text-[#176043] transition-colors">Analizė</a>
            <Link to="/analytics" className="hover:text-[#176043] transition-colors">Analitikos centras</Link>
            <Link to="/analytics/deep-evaluation" className="bg-[#17211d] text-white px-5 py-2.5 rounded-lg hover:bg-[#176043] transition-all">
              Vertinti adresą
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(231,243,238,0.38)),repeating-linear-gradient(90deg,rgba(197,211,204,0.18)_0,rgba(197,211,204,0.18)_1px,transparent_1px,transparent_72px)]" />

        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#e7f3ee] text-[#176043] px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-8 border border-[#c5d3cc]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#176043]" />
            </span>
            Atnaujinti 2026 m. duomenys
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-[#15201c] leading-[1.1] mb-8 tracking-tight">
            Sužinokite daugiau apie <br />
            <span className="text-[#176043]">savo gyvenamąją vietą</span>
          </h1>
          <p className="text-xl text-[#52635d] mb-12 max-w-2xl mx-auto font-medium leading-relaxed">
            Kriminogeninė situacija, viešojo transporto pasiekiamumas, mokyklų reitingai ir OSM infrastruktūra viename interaktyviame žemėlapyje.
          </p>
        </div>

        <div id="search" className="max-w-xl mx-auto scroll-mt-32">
          <div className="bg-white/85 p-2 rounded-lg shadow-2xl shadow-emerald-900/10 border border-[#c5d3cc]/70 backdrop-blur">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-[#697a74]">
                <Search size={24} />
              </div>
              <input
                type="text"
                placeholder="Įrašykite miestą..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full pl-16 pr-6 py-6 bg-transparent rounded-lg text-xl font-bold placeholder-[#9aa8a2] focus:outline-none"
              />
            </div>

            <div className="px-2 pb-2">
              {filteredCities.length > 0 ? (
                <div className="grid gap-2 mt-2">
                  {filteredCities.map((city) => (
                    <Link
                      key={city}
                      to={`/map?city=${encodeURIComponent(city)}`}
                      className="group flex items-center justify-between p-4 bg-[#f7fbf9] hover:bg-[#176043] rounded-lg transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-[#697a74] group-hover:text-[#176043] transition-colors">
                          <MapPin size={24} />
                        </div>
                        <span className="text-lg font-black text-[#26352f] group-hover:text-white transition-colors">
                          {city}
                        </span>
                      </div>
                      <ArrowRight className="text-[#9aa8a2] group-hover:text-white group-hover:translate-x-1 transition-all" size={20} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-[#697a74] font-medium">
                  Miesto „{searchQuery}“ duomenų dar neturime.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Shield className="text-[#d24b43]" />}
            title="Saugumo analizė"
            desc="Nusikalstamumo duomenys suskirstyti pagal miesto teritorijas ir nusikaltimų tipus."
          />
          <FeatureCard
            icon={<Bus className="text-[#1d6f91]" />}
            title="Transporto infrastruktūra"
            desc="Viešojo transporto stotelės, maršrutų dažnumas ir pasiekiamumo indeksas."
          />
          <FeatureCard
            icon={<School className="text-[#176043]" />}
            title="Švietimo įstaigos"
            desc="Mokyklų reitingai, tipai ir jų pasiekiamumas pėsčiomis iš jūsų pasirinktos vietos."
          />
        </div>
      </section>

      <footer className="bg-white/80 border-t border-[#c5d3cc]/70 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-[#697a74] text-sm font-bold uppercase tracking-widest">
            © 2026 AplinkosRizika. Akademiniam pristatymui paruošta miesto analizės sistema.
          </div>
          <div className="flex gap-8 text-[#697a74] font-bold text-sm">
            <a href="#" className="hover:text-[#15201c] transition-colors">Privatumas</a>
            <a href="#" className="hover:text-[#15201c] transition-colors">D.U.K.</a>
            <a href="#" className="hover:text-[#15201c] transition-colors">Kontaktai</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white/85 p-8 rounded-lg border border-[#c5d3cc]/70 hover:shadow-2xl hover:shadow-emerald-900/10 transition-all duration-500 group">
      <div className="w-14 h-14 bg-[#e7f3ee] rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-black text-[#15201c] mb-4">{title}</h3>
      <p className="text-[#52635d] font-medium leading-relaxed">{desc}</p>
    </div>
  );
}
