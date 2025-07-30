import { createContext, useContext, useState, useEffect } from "react";
import PropTypes from 'prop-types';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const url = import.meta.env.VITE_API_URL;
      const response = await fetch(`${url}/auth/user/email`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.email) {
          setUser({
            email: data.email,
            name: data.name || data.email.split('@')[0],
            id: data.id
          });
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check error:", error);
      setUser(null);
      setError("Failed to verify authentication");
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      const authUrl = import.meta.env.VITE_AUTH_URL;
      window.location.href = authUrl;
    } catch (error) {
      setError("Failed to initiate login");
      console.error("Login error:", error);
    }
  };

  const logout = async () => {
    try {
      const url = import.meta.env.VITE_API_URL;
      await fetch(`${url}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      localStorage.removeItem("token");
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
      // Force logout even if API call fails
      setUser(null);
      localStorage.removeItem("token");
      window.location.href = "/";
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuthStatus,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
