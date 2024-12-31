import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";

const Home = () => {
  const [email, setEmail] = useState(""); // Email from backend
  const [room, setRoom] = useState(""); // Auto-generated Room ID
  const [roomGenerated, setRoomGenerated] = useState(false); // Track if room is generated

  const socket = useSocket();
  const navigate = useNavigate();

  // Fetch email from the backend when the component mounts
  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/user/email", {
          credentials: "include", // Send cookies with the request
        });
        const data = await response.json();
        if (response.ok && data.email) {
          setEmail(data.email); // Set the email from backend
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
    if (!roomGenerated) {
      const generatedRoom = Math.random().toString(36).substring(2, 10);
      setRoom(generatedRoom);
      setRoomGenerated(true); // Prevent re-generation
    }
  }, [roomGenerated]);

  const handleSubmitForm = useCallback(
    (e) => {
      e.preventDefault();
      if (email && room) {
        socket.emit("room:join", { email, room });
      } else {
        console.error("Email or room is missing");
      }
    },
    [email, room, socket]
  );

  const handleJoinRoom = useCallback(
    (data) => {
      const { email, room } = data;
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
    <div className="min-h-screen bg-gray-800 flex flex-col items-center justify-center text-white">
      <div className="bg-gray-900 p-8 rounded-lg shadow-lg w-96">
        <h1 className="text-3xl font-bold text-center mb-6">Lobby</h1>
        <form onSubmit={handleSubmitForm} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-400"
            >
              Email ID
            </label>
            <input
              type="email"
              id="email"
              value={email}
              readOnly
              className="w-full mt-2 p-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label
              htmlFor="room"
              className="block text-sm font-medium text-gray-400"
            >
              Room Number
            </label>
            <input
              type="text"
              id="room"
              value={room}
              readOnly
              className="w-full mt-2 p-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition duration-200"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home;
