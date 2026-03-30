// v1.1.2 - Force deployment with final UI fixes
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import ReloadBanner from "./components/ReloadBanner";

import BackgroundCarousel from "./components/BackgroundCarousel";

function App() {
  return (
    <>
      <BackgroundCarousel />
      <ReloadBanner />
      <AppRouter />
    </>
  );
}

export default App;
