import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const { login, register, verifyEmailCode, sendResetCode, verifyResetCode, updatePassword } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isNoOficial, setIsNoOficial } = useConfig();
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
  const [showChangelog, setShowChangelog] = useState(false);

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
    /* Registro público deshabilitado - movido a Garantía de Calidad */
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
      case "bodega":
        navigate("/bodega");
        break;
      case "bodega_mp":
        navigate("/bodega-mp");
        break;
      case "bodega_pt":
        navigate("/bodega-pt");
        break;
      case "microbiologia": navigate("/microbiologia"); break;
      case "controlcalidad": navigate("/controlcalidad"); break;
      case "planeacion": navigate("/Dashboard"); break;
      case "mantenimiento": navigate("/mantenimiento"); break;
      case "compras": navigate("/compras"); break;
      case "gestioncalidad": navigate("/gestioncalidad"); break;
      case "direcciontecnica": navigate("/direccion-tecnica"); break;
      case "garantiacalidad": navigate("/garantiacalidad"); break;
      default: navigate("/");
    }
  };

  // === PASSWORD VISIBILITY ===
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="login-wrapper">
      {/* LEFT COLUMN (60%) - Corporate Background */}
      <div className="login-image-section">
        <div className="login-image-overlay-text">
          <h1>Excelencia Farmacéutica</h1>
          <p>Innovación y calidad en cada proceso.</p>
        </div>
      </div>

      {/* RIGHT COLUMN (40%) - Login Form */}
      <div className="login-form-container fade-in">
        <div className="login-card slide-up">
          <div className="login-header">
            <img
              className="logo-gusing"
              src="https://gqspcolombia.org/wp-content/uploads/2025/09/21.png"
              alt="Laboratorios Gusing"
            />
            <h2 className="login-title">Bienvenido al Portal Corporativo</h2>
            <p className="subtitle">Acceso exclusivo para personal autorizado</p>
            
            {/* Selector de Ambiente */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button 
                type="button"
                onClick={() => setIsNoOficial(false)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', transition: 'all 0.3s',
                  backgroundColor: !isNoOficial ? 'var(--accent)' : 'var(--bg-card)',
                  color: !isNoOficial ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border)'
                }}
              >
                🏢 Oficial
              </button>
              <button 
                type="button"
                onClick={() => setIsNoOficial(true)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', transition: 'all 0.3s',
                  backgroundColor: isNoOficial ? '#ef4444' : 'var(--bg-card)',
                  color: isNoOficial ? '#fff' : 'var(--text-main)',
                  border: isNoOficial ? '1px solid #ef4444' : '1px solid var(--border)'
                }}
              >
                🧪 No Oficial
              </button>
            </div>

            {isNoOficial && (
              <div style={{ 
                backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '8px', 
                marginTop: '15px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', border: '1px solid #f87171' 
              }}>
                ⚠️ AMBIENTE NO OFICIAL (PRUEBAS)
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {mode === "login" && (
              <>
                <div className="input-group">
                  <label>Usuario o correo</label>
                  <input
                    type="text"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="Ingrese su usuario o correo"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Contraseña</label>
                  <div className="password-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={contrasena}
                      onChange={(e) => setContrasena(e.target.value)}
                      placeholder="Ingrese su contraseña"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div className="login-actions">
                  <label className="checkbox-container">
                    <input type="checkbox" />
                    <span className="checkmark"></span>
                    Recordarme
                  </label>
                  <button
                    type="button"
                    className="forgot-pass-link"
                    onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }}
                  >
                    ¿Olvidó su contraseña?
                  </button>
                </div>
              </>
            )}

            {/* Verification and Reset Modes */}
            {(mode === "verify" || mode === "reset") && (
              <>
                <div className="info-badge">
                  {mode === "verify"
                    ? `Código enviado a ${correo}`
                    : `Ingrese código y nueva contraseña`}
                </div>
                <div className="input-group">
                  <label>Código de Verificación</label>
                  <input
                    type="text"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="000000"
                    required
                  />
                </div>
                {mode === "reset" && (
                  <div className="input-group">
                    <label>Nueva Contraseña</label>
                    <input
                      type="password"
                      value={nuevaContrasena}
                      onChange={(e) => setNuevaContrasena(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                    />
                  </div>
                )}
              </>
            )}

            {mode === "forgot" && (
              <>
                <p className="instruction-text">
                  Ingrese su correo corporativo para restablecer el acceso.
                </p>
                <div className="input-group">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="ejemplo@gusing.com"
                    required
                  />
                </div>
              </>
            )}

            {error && <div className="error-banner">⚠️ {error}</div>}
            {success && <div className="success-banner">✅ {success}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? <span className="loader"></span> :
                mode === "login" ? "Iniciar Sesión" :
                  mode === "verify" ? "Verificar Acceso" :
                    mode === "forgot" ? "Enviar Código" :
                      "Actualizar Credenciales"}
            </button>
          </form>

          {mode !== "login" && (
            <button className="back-link" onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>
              ← Volver al inicio
            </button>
          )}

          <div className="trust-badges">
            <span>🔒 Conexión segura SSL</span>
            <span>🛡 Acceso protegido</span>
          </div>
        </div>

        <footer className="login-footer">
          <p>© {new Date().getFullYear()} Laboratorios Gusing S.A.S. • Todos los derechos reservados</p>
          <div className="system-status">
            <span className="status-dot"></span> Estado del sistema: Operativo
          </div>
        </footer>

        <button className="login-theme-toggle-corner" onClick={toggleTheme} type="button">
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      <div className="changelog-container">
        <button
          className={`changelog-btn ${showChangelog ? 'active' : ''}`}
          onClick={() => setShowChangelog(!showChangelog)}
          type="button"
        >
          <span>{showChangelog ? '✖️' : '✨'}</span>
        </button>

        {showChangelog && (
          <div className="changelog-dropdown slide-up">
            <h3>Novedades del Portal</h3>
            <ul>
              <li><strong>🚀 Nuevo Diseño Enterprise:</strong> Interfaz corporativa de alto nivel.</li>
              <li><strong>🧪 Microbiología:</strong> Flujo de Liberación de Área.</li>
              <li><strong>✅ Mejoras:</strong> Correcciones post capacitacion a cada implicado en el sistema.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
