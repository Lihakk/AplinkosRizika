import { BrowserRouter, Routes, Route } from "react-router-dom";
import CitySelect from "./pages/CitySelect";
import MapPage from "./pages/MapPage";
import './index.css'
import AnalysisPage from "./pages/AnalysisPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CitySelect />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
      </Routes>
    </BrowserRouter>
  );
}
