import { BrowserRouter, Routes, Route } from "react-router-dom";
import CitySelect from "./pages/CitySelect";
import MapPage from "./pages/MapPage";
import './index.css'
import AnalysisPage from "./pages/AnalysisPage";
import {
  AnalyticsHomePage,
  DeepEvaluationDashboardPage,
  EldershipComparisonPage,
  RealEstateAnalyticsPage,
  RecommendationPage,
} from "./pages/analytics/AnalyticsHub";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CitySelect />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/analytics" element={<AnalyticsHomePage />} />
        <Route path="/analytics/elderships" element={<EldershipComparisonPage />} />
        <Route path="/analytics/real-estate" element={<RealEstateAnalyticsPage />} />
        <Route path="/analytics/recommendation" element={<RecommendationPage />} />
        <Route path="/analytics/deep-evaluation" element={<DeepEvaluationDashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
