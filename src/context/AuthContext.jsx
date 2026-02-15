import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [cargando, setCargando] = useState(true);

  // ========================================
  // Cargar usuario desde localStorage
  // ========================================
  useEffect(() => {
    const storedUser = localStorage.getItem("usuarioActual");
    if (storedUser) {
      setUsuarioActual(JSON.parse(storedUser));
    }
    setCargando(false);
  }, []);

  // ========================================
  // REGISTER (Sign Up)
  // ========================================
  const register = async (usuario, correo, contrasena) => {
    try {
      // 1. Registro en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: contrasena,
        options: {
          data: {
            display_name: usuario,
            rol: "usuario"
          }
        }
      });

      if (error) throw error;
      return { ok: true, message: "Código enviado al correo." };
    } catch (err) {
      console.error("Error en registro:", err);
      return { ok: false, message: err.message };
    }
  };

  // ========================================
  // VERIFY CODE (Verify OTP)
  // ========================================
  const verifyEmailCode = async (correo, token, usuario) => {
    try {
      const { data: { session }, error } = await supabase.auth.verifyOtp({
        email: correo,
        token: token,
        type: 'signup'
      });

      if (error) throw error;

      // 2. Insertar en la tabla public.usuarios después de verificar
      // El ID de Supabase Auth debe coincidir con el de nuestra tabla
      const { error: dbError } = await supabase
        .from("usuarios")
        .insert({
          id: session.user.id,
          usuario: usuario,
          correo: correo,
          rol: "usuario",
          areadetrabajo: "Solicitante",
          contrasena: "SUPABASE_AUTH" // Marcador o dejar null si se prefiere
        });

      if (dbError) {
        console.error("Error guardando en public.usuarios:", dbError);
        // A veces el usuario ya existe por errores previos, intentamos capturarlo
      }

      // Login automático
      const userData = {
        id: session.user.id,
        usuario: usuario,
        rol: "usuario",
        areadetrabajo: "Solicitante",
        correo: correo,
      };

      setUsuarioActual(userData);
      localStorage.setItem("usuarioActual", JSON.stringify(userData));

      return { ok: true, rol: "usuario" };
    } catch (err) {
      console.error("Error verificando código:", err);
      return { ok: false, message: err.message };
    }
  };

  // ========================================
  // LOGIN (Dual Support: Custom table & Supabase Auth)
  // ========================================
  const login = async (usuarioInput, contrasena) => {
    try {
      // Intento 1: Supabase Auth (por si es correo electrónico)
      const isEmail = usuarioInput.includes("@");
      if (isEmail) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: usuarioInput,
          password: contrasena
        });

        if (!error && data.user) {
          // Si entra por aquí, buscamos sus datos en public.usuarios
          const { data: dbUser } = await supabase
            .from("usuarios")
            .select("*")
            .eq("id", data.user.id)
            .single();

          if (dbUser) {
            const userData = {
              id: dbUser.id,
              usuario: dbUser.usuario,
              rol: dbUser.rol?.toLowerCase().trim() || "usuario",
              areadetrabajo: dbUser.areadetrabajo,
              correo: dbUser.correo,
            };
            setUsuarioActual(userData);
            localStorage.setItem("usuarioActual", JSON.stringify(userData));
            return { ok: true, rol: userData.rol };
          }
        }
      }

      // Intento 2: Buscar por usuario en la tabla personalizada (Legacy)
      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("usuario", usuarioInput)
        .single();

      if (error || !data) return { ok: false };

      // Validar contraseña plana (Legacy)
      if (data.contrasena !== contrasena) {
        // Podría ser que el usuario ya existe en Supabase Auth pero lo buscamos por Nickname
        // Intentamos login con el correo y pass si el usuario tiene correo
        if (data.id && data.correo) {
          const { error: authErr } = await supabase.auth.signInWithPassword({
            email: data.correo,
            password: contrasena
          });
          if (!authErr) {
            // Reintento exitoso por Supabase Auth
            const userData = {
              id: data.id,
              usuario: data.usuario,
              rol: data.rol?.toLowerCase().trim() || "usuario",
              areadetrabajo: data.areadetrabajo,
              correo: data.correo,
            };
            setUsuarioActual(userData);
            localStorage.setItem("usuarioActual", JSON.stringify(userData));
            return { ok: true, rol: userData.rol };
          }
        }
        return { ok: false };
      }

      const userData = {
        id: data.id,
        usuario: data.usuario,
        rol: data.rol ? data.rol.toLowerCase().trim() : null,
        areadetrabajo: data.areadetrabajo !== "NA" ? data.areadetrabajo : null,
        correo: data.correo ?? null,
      };

      setUsuarioActual(userData);
      localStorage.setItem("usuarioActual", JSON.stringify(userData));

      return { ok: true, rol: userData.rol };

    } catch (err) {
      console.error("Error en login:", err);
      return { ok: false };
    }
  };

  // ========================================
  // PASSWORD RECOVERY (Forgot Password)
  // ========================================
  const sendResetCode = async (correo) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(correo);
      if (error) throw error;
      return { ok: true, message: "Código de recuperación enviado." };
    } catch (err) {
      console.error("Error enviando reset code:", err);
      return { ok: false, message: err.message };
    }
  };

  const verifyResetCode = async (correo, token) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: correo,
        token: token,
        type: 'recovery'
      });
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      console.error("Error verificando reset code:", err);
      return { ok: false, message: err.message };
    }
  };

  const updatePassword = async (nuevaContrasena) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: nuevaContrasena
      });
      if (error) throw error;

      // También actualizar en la tabla public.usuarios para el sistema legacy
      if (data.user) {
        await supabase
          .from("usuarios")
          .update({ contrasena: "SUPABASE_AUTH" }) // O la contraseña si se sincroniza
          .eq("id", data.user.id);
      }

      return { ok: true };
    } catch (err) {
      console.error("Error actualizando contraseña:", err);
      return { ok: false, message: err.message };
    }
  };

  // ========================================
  // LOGOUT
  // ========================================
  const logout = async () => {
    await supabase.auth.signOut();
    setUsuarioActual(null);
    localStorage.removeItem("usuarioActual");
  };

  if (cargando) return null;

  return (
    <AuthContext.Provider value={{
      usuarioActual, login, logout, register, verifyEmailCode,
      sendResetCode, verifyResetCode, updatePassword, cargando
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
