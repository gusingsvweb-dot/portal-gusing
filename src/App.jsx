import AppRouter from "./router.jsx";
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
