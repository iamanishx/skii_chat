import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";
import { useAuth } from "../context/AuthProvider";

const Home = () => {
  const [room, setRoom] = useState(""); 
  const [manualRoom, setManualRoom] = useState(""); 
  const [view, setView] = useState("create");

  const socket = useSocket();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Generate room ID when the user enters the lobby
  useEffect(() => {
    if (!room) {
      const generatedRoom = Math.random().toString(36).substring(2, 10);
      setRoom(generatedRoom);
    }
  }, [room]);

  const generateNewRoom = () => {
    const newRoom = Math.random().toString(36).substring(2, 10);
    setRoom(newRoom);
  };

  const handleSubmitForm = useCallback(
    (e) => {
      e.preventDefault();
      const selectedRoom = manualRoom || room; 
      if (user?.email && selectedRoom) {
        socket.emit("room:join", { email: user.email, room: selectedRoom });
      } else {
        console.error("Email or room is missing");
      }
    },
    [user?.email, room, manualRoom, socket]
  );

  const handleJoinRoom = useCallback(
    (data) => {
      const { room } = data;
      navigate(`/room/${room}`);
    },
    [navigate]
  );

  useEffect(() => {
    socket.on("room:join", handleJoinRoom);
    return () => {
      socket.off("room:join", handleJoinRoom);
    };
  }, [socket, handleJoinRoom]);

  const handleCopyRoom = async () => {
    try {
      await navigator.clipboard.writeText(room);
      // You could add a toast notification here instead of alert
      alert("Room ID copied to clipboard!");
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800/90 backdrop-blur-sm shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white">Skii Chat</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-300">Welcome back</p>
                <p className="text-sm font-medium text-white">{user?.name || user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="bg-gray-800/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Video Call Room</h2>
            <p className="text-gray-400">Create or join a secure video call</p>
          </div>

          {/* Tab Navigation */}
          <div className="flex bg-gray-700 rounded-lg p-1 mb-6">
            <button
              onClick={() => setView("create")}
              className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all ${
                view === "create" 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "text-gray-300 hover:text-white hover:bg-gray-600"
              }`}
            >
              Create Room
            </button>
            <button
              onClick={() => setView("join")}
              className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all ${
                view === "join" 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "text-gray-300 hover:text-white hover:bg-gray-600"
              }`}
            >
              Join Room
            </button>
          </div>

          {/* Create Room View */}
          {view === "create" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Room ID
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={room}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={generateNewRoom}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                    title="Generate new room ID"
                  >
                    🔄
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyRoom}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    title="Copy room ID"
                  >
                    📋
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Share this room ID with others to join your call
                </p>
              </div>

              <button
                onClick={handleSubmitForm}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-lg hover:shadow-xl"
              >
                Create & Join Room
              </button>
            </div>
          )}

          {/* Join Room View */}
          {view === "join" && (
            <form onSubmit={handleSubmitForm} className="space-y-6">
              <div>
                <label
                  htmlFor="manualRoom"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Room ID
                </label>
                <input
                  type="text"
                  id="manualRoom"
                  placeholder="Enter the room ID to join"
                  value={manualRoom}
                  onChange={(e) => setManualRoom(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ask the host for the room ID
                </p>
              </div>

              <button
                type="submit"
                disabled={!manualRoom.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors shadow-lg hover:shadow-xl"
              >
                Join Room
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
