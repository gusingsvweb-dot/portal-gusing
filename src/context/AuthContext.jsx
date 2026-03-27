import { createContext, useContext, useState, useEffect } from "react";
import { supabase, st } from "../api/supabaseClient";

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
  const register = async (usuario, correo, contrasena, rol = "usuario", areadetrabajo = "Solicitante") => {
    try {
      // 1. Registro en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: contrasena,
        options: {
          data: {
            display_name: usuario,
            rol: rol,
            areadetrabajo: areadetrabajo
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
      const { data: { session, user }, error } = await supabase.auth.verifyOtp({
        email: correo,
        token: token,
        type: 'signup'
      });

      if (error) throw error;

      // Recuperar el rol y área de la metadata del usuario registrado
      const rolMetadata = user?.user_metadata?.rol || "usuario";
      const areaMetadata = user?.user_metadata?.areadetrabajo || "Solicitante";

      // 2. Insertar en la tabla public.usuarios después de verificar
      const { error: dbError } = await supabase
        .from(st("usuarios"))
        .insert({
          id: session.user.id,
          usuario: usuario,
          correo: correo,
          rol: rolMetadata,
          areadetrabajo: areaMetadata,
          contrasena: "SUPABASE_AUTH"
        });

      if (dbError) {
        console.error("Error guardando en public.usuarios:", dbError);
      }

      // Login automático
      const userData = {
        id: session.user.id,
        usuario: usuario,
        rol: rolMetadata.toLowerCase().trim(),
        areadetrabajo: areaMetadata,
        correo: correo,
      };

      setUsuarioActual(userData);
      localStorage.setItem("usuarioActual", JSON.stringify(userData));

      return { ok: true, rol: userData.rol };
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
            .from(st("usuarios"))
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
        .from(st("usuarios"))
        .select("*")
        .eq("usuario", usuarioInput)
        .limit(1);

      if (error) {
        console.error("❌ Error en consulta de tabla usuarios (406?):", error);
        return { ok: false };
      }

      const userRow = data && data[0];
      if (!userRow) {
        console.warn(`⚠️ No se encontró usuario '${usuarioInput}' en la tabla usuarios.`);
        return { ok: false };
      }

      // Validar contraseña plana (Legacy)
      if (userRow.contrasena !== contrasena) {
        // Podría ser que el usuario ya existe en Supabase Auth pero lo buscamos por Nickname
        if (userRow.id && userRow.correo) {
          const { error: authErr } = await supabase.auth.signInWithPassword({
            email: userRow.correo,
            password: contrasena
          });
          if (!authErr) {
            const userData = {
              id: userRow.id,
              usuario: userRow.usuario,
              rol: userRow.rol?.toLowerCase().trim() || "usuario",
              areadetrabajo: userRow.areadetrabajo,
              correo: userRow.correo,
            };
            setUsuarioActual(userData);
            localStorage.setItem("usuarioActual", JSON.stringify(userData));
            return { ok: true, rol: userData.rol };
          }
        }
        return { ok: false };
      }

      const userData = {
        id: userRow.id,
        usuario: userRow.usuario,
        rol: userRow.rol ? userRow.rol.toLowerCase().trim() : null,
        areadetrabajo: userRow.areadetrabajo !== "NA" ? userRow.areadetrabajo : null,
        correo: userRow.correo ?? null,
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
          .from(st("usuarios"))
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

  const verifyUserAdmin = async (correo, token, usuario) => {
    try {
      const { data: { session, user }, error } = await supabase.auth.verifyOtp({
        email: correo,
        token: token,
        type: 'signup'
      });

      if (error) throw error;

      // Recuperar el rol y área de la metadata del usuario registrado
      const rolMetadata = user?.user_metadata?.rol || "usuario";
      const areaMetadata = user?.user_metadata?.areadetrabajo || "Solicitante";

      // 2. Insertar en la tabla public.usuarios después de verificar
      const { error: dbError } = await supabase
        .from(st("usuarios"))
        .insert({
          id: session.user.id,
          usuario: usuario,
          correo: correo,
          rol: rolMetadata,
          areadetrabajo: areaMetadata,
          contrasena: "SUPABASE_AUTH"
        });

      if (dbError) {
        console.error("Error guardando en public.usuarios:", dbError);
      }

      return { ok: true };
    } catch (err) {
      console.error("Error verificando código (Admin):", err);
      return { ok: false, message: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      usuarioActual, login, logout, register, verifyEmailCode, verifyUserAdmin,
      sendResetCode, verifyResetCode, updatePassword, cargando
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
