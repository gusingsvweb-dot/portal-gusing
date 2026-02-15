import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer-wrapper">
      © {new Date().getFullYear()} Laboratorios Gusing S.A.S — Todos los derechos reservados.
    </footer>
  );
}
