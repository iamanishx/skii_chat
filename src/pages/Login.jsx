import React, { useEffect } from "react";
 
const Login = () => {
 
  useEffect(() => {
      localStorage.removeItem("token");
  }, [ ]);

  const handleGoogleAuth = () => {
    window.location.href = "http://localhost:3000/auth/google";
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-4xl font-bold text-white text-center mb-6">Welcome!</h1>
        <p className="text-gray-400 text-center mb-8">
          Sign in with your Google account to continue
        </p>
        <div className="flex justify-center">
          <button
            onClick={handleGoogleAuth}
            className="flex items-center gap-3 bg-white text-black font-medium px-6 py-3 rounded-lg shadow hover:bg-white hover:shadow-lg"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png"
              alt="Google Icon"
              className="w-6 h-6"
            />
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
  