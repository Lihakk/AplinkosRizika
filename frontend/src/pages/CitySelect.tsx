import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search, ChevronRight, Shield, Bus, School, Info, ArrowRight } from "lucide-react";
import "./CitySelect.css";

const allCities = ["Kaunas", "Vilnius"].sort();

export default function CitySelect() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCities = allCities.filter(city =>
    city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-700 font-sans">
      
      {/* 1. Navigacija */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Shield className="text-white" size={24} />
            </div>
            <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
              AplinkosRizika
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-500">
            <a href="#features" className="hover:text-blue-600 transition-colors">Savybės</a>
            <a href="#search" className="hover:text-blue-600 transition-colors">Analizė</a>
            <button className="bg-slate-900 text-white px-5 py-2.5 rounded-full hover:bg-blue-600 transition-all">
              Prisijungti
            </button>
          </div>
        </div>
      </nav>

      {/* 2. Hero Sekcija */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 overflow-hidden">
           <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/10 blur-[120px] rounded-full"></div>
           <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-indigo-400/10 blur-[100px] rounded-full"></div>
        </div>

        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-8 border border-blue-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Atnaujinti 2026 m. duomenys
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 leading-[1.1] mb-8 tracking-tight">
            Sužinokite tiesą apie <br />
            <span className="text-blue-600">savo gyvenamąją vietą</span>
          </h1>
          <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto font-medium leading-relaxed">
            Išsami kriminogeninė situacija, viešojo transporto pasiekiamumas ir geriausių mokyklų reitingai – viskas viename žemėlapyje.
          </p>
        </div>

        {/* 3. Paieškos Blokas (Integruotas CitySelect) */}
        <div id="search" className="max-w-xl mx-auto scroll-mt-32">
          <div className="bg-white p-2 rounded-[2.5rem] shadow-2xl shadow-blue-500/10 border border-slate-200/50">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-slate-400">
                <Search size={24} />
              </div>
              <input
                type="text"
                placeholder="Įrašykite savo miestą..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-16 pr-6 py-6 bg-transparent rounded-[2rem] text-xl font-bold placeholder-slate-300 focus:outline-none"
              />
            </div>
            
            {/* Filtruotas sąrašas */}
            <div className="px-2 pb-2">
              {filteredCities.length > 0 ? (
                <div className="grid gap-2 mt-2">
                  {filteredCities.map((city) => (
                    <Link 
                      key={city} 
                      to={`/map?city=${encodeURIComponent(city)}`} 
                      className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-blue-600 rounded-2xl transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                          <MapPin size={24} />
                        </div>
                        <span className="text-lg font-black text-slate-700 group-hover:text-white transition-colors">
                          {city}
                        </span>
                      </div>
                      <ArrowRight className="text-slate-300 group-hover:text-white group-hover:translate-x-1 transition-all" size={20} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 font-medium">
                   Miesto "{searchQuery}" duomenų neturime.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Savybių Sekcija */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<Shield className="text-rose-500" />} 
            title="Saugumo Analizė" 
            desc="Vėliausi nusikalstamumo duomenys suskirstyti pagal rajonus ir nusikaltimų tipus."
          />
          <FeatureCard 
            icon={<Bus className="text-blue-500" />} 
            title="Transporto Infrastruktūra" 
            desc="Viešojo transporto stotelės, maršrutų dažnumas ir pasiekiamumo indeksas."
          />
          <FeatureCard 
            icon={<School className="text-emerald-500" />} 
            title="Švietimo Įstaigos" 
            desc="Mokyklų reitingai, tipai ir jų pasiekiamumas pėsčiomis iš jūsų vietos."
          />
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-slate-400 text-sm font-bold uppercase tracking-widest">
            © 2026 AplinkosRizika. Visi duomenys oficialūs.
          </div>
          <div className="flex gap-8 text-slate-400 font-bold text-sm">
            <a href="#" className="hover:text-slate-900 transition-colors">Privatumas</a>
            <a href="#" className="hover:text-slate-900 transition-colors">D.U.K.</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Kontaktai</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Pagalbinis komponentas kortelėms
function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 hover:shadow-2xl hover:shadow-slate-200 transition-all duration-500 group">
      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-black text-slate-900 mb-4">{title}</h3>
      <p className="text-slate-500 font-medium leading-relaxed">{desc}</p>
    </div>
  );
}