import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const { login, register, verifyEmailCode, sendResetCode, verifyResetCode, updatePassword } = useAuth();
  const navigate = useNavigate();

  // Estados UI
  const [mode, setMode] = useState("login"); // "login" | "register" | "verify" | "forgot" | "reset"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Campos Form
  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");

  // === SLIDESHOW ===
  const images = [
    "https://botanisse.co/wp-content/uploads/2022/03/G-DROSS-1.png",
    "https://botanisse.co/wp-content/uploads/2022/03/G-RECOL.png",
    "https://bioproductos.com.ec/wp-content/uploads/2024/05/PRODUCTOS-PRUEBA-10.png",
  ];

  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // === SUBMIT HANDLER ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "login") {
      const result = await login(usuario, contrasena);
      if (!result.ok) {
        setError("Usuario o contraseña incorrectos");
        setLoading(false);
        return;
      }
      redirigirPorRol(result.rol);
    }
    else if (mode === "register") {
      const result = await register(usuario, correo, contrasena);
      if (result.ok) {
        setMode("verify");
      } else {
        setError(result.message || "Error al registrarse");
      }
    }
    else if (mode === "verify") {
      const result = await verifyEmailCode(correo, codigo, usuario);
      if (result.ok) {
        redirigirPorRol(result.rol);
      } else {
        setError(result.message || "Código inválido");
      }
    }
    else if (mode === "forgot") {
      const result = await sendResetCode(correo);
      if (result.ok) {
        setSuccess("Código de recuperación enviado. Revisa tu correo.");
        setMode("reset");
      } else {
        setError(result.message || "Error al enviar código");
      }
    }
    else if (mode === "reset") {
      const verifyRes = await verifyResetCode(correo, codigo);
      if (verifyRes.ok) {
        const updateRes = await updatePassword(nuevaContrasena);
        if (updateRes.ok) {
          setSuccess("Contraseña actualizada con éxito. Ya puedes iniciar sesión.");
          setMode("login");
          setNuevaContrasena("");
          setCodigo("");
        } else {
          setError(updateRes.message || "Error al actualizar contraseña");
        }
      } else {
        setError(verifyRes.message || "Código inválido o expirado");
      }
    }
    setLoading(false);
  };

  const redirigirPorRol = (rol) => {
    switch (rol) {
      case "gerencia": navigate("/gerencia"); break;
      case "atencion": navigate("/atencion"); break;
      case "produccion": navigate("/produccion"); break;
      case "usuario": navigate("/usuario/crear-solicitud"); break;
      case "acondicionamiento": navigate("/acondicionamiento"); break;
      case "bodega": navigate("/bodega"); break;
      case "microbiologia": navigate("/microbiologia"); break;
      case "controlcalidad": navigate("/controlcalidad"); break;
      case "planeacion": navigate("/Dashboard"); break;
      case "mantenimiento": navigate("/mantenimiento"); break;
      case "compras": navigate("/compras"); break;
      case "gestioncalidad": navigate("/gestioncalidad"); break;
      case "direcciontecnica": navigate("/direccion-tecnica"); break;
      default: navigate("/");
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-left fade-in">
        <div className="particles"></div>
        <div className="login-card slide-up">
          <img
            className="logo-gusing logo-animate"
            src="https://gqspcolombia.org/wp-content/uploads/2025/09/21.png"
            alt="Laboratorios Gusing"
          />

          <h2 className="login-title">
            {mode === "login" ? "Portal Interno" :
              mode === "register" ? "Crear Cuenta" :
                mode === "verify" ? "Verificar Correo" :
                  mode === "forgot" ? "Recuperar Acceso" :
                    "Nueva Contraseña"}
          </h2>
          <p className="subtitle">Laboratorios Gusing S.A.S</p>

          <form onSubmit={handleSubmit} className="login-form">
            {mode === "login" && (
              <>
                <label>Usuario / Correo</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ingrese su usuario o correo"
                  required
                />
                <label>Contraseña</label>
                <input
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="********"
                  required
                />
              </>
            )}

            {mode === "register" && (
              <>
                <label>Usuario</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Elija un nombre de usuario"
                  required
                />
                <label>Correo Electrónico</label>
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="ejemplo@gusing.com"
                  required
                />
                <label>Contraseña</label>
                <input
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
              </>
            )}

            {(mode === "verify" || mode === "reset") && (
              <>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '15px' }}>
                  {mode === "verify"
                    ? `Hemos enviado un código a ${correo}.`
                    : `Ingresa el código enviado a ${correo} y tu nueva contraseña.`}
                </p>
                <label>Código de Verificación</label>
                <input
                  type="text"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="000000"
                  required
                />
                {mode === "reset" && (
                  <>
                    <label>Nueva Contraseña</label>
                    <input
                      type="password"
                      value={nuevaContrasena}
                      onChange={(e) => setNuevaContrasena(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                    />
                  </>
                )}
              </>
            )}

            {mode === "forgot" && (
              <>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '15px' }}>
                  Ingresa tu correo electrónico para recibir un código de recuperación.
                </p>
                <label>Correo Electrónico</label>
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="ejemplo@gusing.com"
                  required
                />
              </>
            )}

            {error && <p className="error-text">{error}</p>}
            {success && <p style={{ color: '#10b981', fontSize: '13px', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{success}</p>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? "Procesando..." :
                mode === "login" ? "Iniciar Sesión" :
                  mode === "register" ? "Registrarse" :
                    mode === "verify" ? "Verificar" :
                      mode === "forgot" ? "Enviar Código" :
                        "Actualizar Contraseña"}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            {mode === "login" ? (
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                ¿No tiene cuenta? <button className="forgot-pass" onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Crear una ahora</button>
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                ¿Ya tiene cuenta? <button className="forgot-pass" onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Volver al login</button>
              </p>
            )}
          </div>

          {mode === "login" && (
            <button className="forgot-pass" onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }}>
              ¿Olvidó su contraseña?
            </button>
          )}
        </div>

        <footer className="login-footer">
          © {new Date().getFullYear()} Laboratorios Gusing S.A.S — Todos los derechos reservados.
        </footer>
      </div>

      {/* DERECHA SLIDESHOW */}
      <div
        className="login-right fade-image"
        style={{ backgroundImage: `url(${images[currentImage]})` }}
      >
        <div className="login-image-overlay"></div>
      </div>
    </div>
  );
}
