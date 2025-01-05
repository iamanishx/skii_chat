import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";

const Home = () => {
  const [email, setEmail] = useState(""); // Email from backend
  const [room, setRoom] = useState(""); // Auto-generated Room ID
  const [manualRoom, setManualRoom] = useState(""); // Room ID entered manually by the user
  const [view, setView] = useState("create"); // Toggle between Create and Join views

  const socket = useSocket();
  const navigate = useNavigate();

  // Fetch email from the backend when the component mounts
  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const response = await fetch(
          "https://skii-chat.up.railway.app/api/user/email",
          {
            credentials: "include", 
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        const data = await response.json();
        if (response.ok && data.email) {
          setEmail(data.email); 
          console.log("Email fetched:", data.email);
        } else {
          console.error("Failed to fetch email");
        }
      } catch (error) {
        console.error("Error fetching email:", error);
      }
    };

    fetchEmail();
  }, []);

  // Generate room ID when the user enters the lobby
  useEffect(() => {
    if (!room) {
      const generatedRoom = Math.random().toString(36).substring(2, 10);
      setRoom(generatedRoom);
    }
  }, [room]);

  const handleSubmitForm = useCallback(
    (e) => {
      e.preventDefault();
      const selectedRoom = manualRoom || room; 
      if (email && selectedRoom) {
        socket.emit("room:join", { email, room: selectedRoom });
      } else {
        console.error("Email or room is missing");
      }
    },
    [email, room, manualRoom, socket]
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

  const handleCopyRoom = () => {
    navigator.clipboard.writeText(room);
    alert("Room ID copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 to-black flex items-center justify-center text-white">
      <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-96">
        <h1 className="text-3xl font-bold text-center mb-6">Skii Chat</h1>

        <div className="flex justify-center mb-6">
          <button
            onClick={() => setView("create")}
            className={`px-4 py-2 rounded-l-lg font-semibold ${
              view === "create" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            Create Room
          </button>
          <button
            onClick={() => setView("join")}
            className={`px-4 py-2 rounded-r-lg font-semibold ${
              view === "join" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            Join Room
          </button>
        </div>

        {view === "create" && (
          <div>
            <form>
              <div className="mb-4">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-400 mb-2"
                >
                  Your Email ID
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  readOnly
                  className="w-full p-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="room"
                  className="block text-sm font-medium text-gray-400 mb-2"
                >
                  Auto-Generated Room ID
                </label>
                <input
                  type="text"
                  id="room"
                  value={room}
                  readOnly
                  className="w-full p-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
                <button
                  type="button"
                  onClick={handleCopyRoom}
                  className="mt-2 text-sm text-gray-400 hover:text-gray-200 underline"
                >
                  Copy Room ID
                </button>
              </div>
              <button
                type="submit"
                onClick={handleSubmitForm}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg mt-4"
              >
                Join Room
              </button>
            </form>
          </div>
        )}

        {view === "join" && (
          <form onSubmit={handleSubmitForm}>
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-400 mb-2"
              >
                Your Email ID
              </label>
              <input
                type="email"
                id="email"
                value={email}
                readOnly
                className="w-full p-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="manualRoom"
                className="block text-sm font-medium text-gray-400 mb-2"
              >
                Enter Room ID
              </label>
              <input
                type="text"
                id="manualRoom"
                placeholder="Enter Room ID"
                value={manualRoom}
                onChange={(e) => setManualRoom(e.target.value)}
                className="w-full p-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg"
            >
              Join Room
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Home;
