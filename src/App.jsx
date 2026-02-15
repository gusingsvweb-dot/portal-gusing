import AppRouter from "./router.jsx";
import ReloadBanner from "./components/ReloadBanner";

function App() {
  return (
    <>
      <ReloadBanner />
      <AppRouter />
    </>
  );
}

export default App;
