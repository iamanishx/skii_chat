import { useEffect } from "react";
import { useAuth } from "../context/AuthProvider";
import { Navigate, useLocation } from "react-router-dom";
 
const Login = () => {
  const { user, login, loading } = useAuth();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || "/home";

  useEffect(() => {
    localStorage.removeItem("token");
  }, []);

  // If user is already authenticated, redirect to intended page
  if (user) {
    return <Navigate to={from} replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center px-4">
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full border border-gray-700">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Skii Chat</h1>
          <p className="text-gray-400">
            Secure peer-to-peer video calling
          </p>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-300 text-center text-sm">
            Sign in with your Google account to start video calling
          </p>
          
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-medium px-6 py-3 rounded-lg shadow-lg hover:bg-gray-100 transition-all duration-200 transform hover:scale-105"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png"
              alt="Google Icon"
              className="w-6 h-6"
            />
            Continue with Google
          </button>
          
          <div className="text-center text-xs text-gray-500 mt-4">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
  