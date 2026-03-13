import { BrowserRouter, Routes, Route } from "react-router-dom";
import CitySelect from "./pages/CitySelect";
import MapPage from "./pages/MapPage";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CitySelect />} />
        <Route path="/map" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  );
}
