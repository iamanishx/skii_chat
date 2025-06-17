import React, { createContext, useMemo, useContext } from "react";
import { io } from "socket.io-client";
import PeerService from "../service/peer";

const SocketContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => {
  const socket = useContext(SocketContext);
  return socket;
};

export const SocketProvider = (props) => {
  const socketUrl = import.meta.env.VITE_SOCKET_URL;
  
  const socket = useMemo(() => {
    const s = io(socketUrl);
    
    // Only basic connection logging here
    s.on("connect", () => {
      console.log("🔌 Socket connected:", s.id);
    });
    
    s.on("disconnect", () => {
      console.log("🔌 Socket disconnected");
    });

    // Handle room join event - keep this for logging
    s.on("user:joined", ({ id, room, email }) => {
      console.log(`New user joined room ${room} with ID:`, id);
    });

    // REMOVE ALL THESE DUPLICATE HANDLERS:
    // - incoming:call (Room.jsx handles this)
    // - call:accepted (Room.jsx handles this) 
    // - peer:nego:needed (not used)
    // - peer:nego:final (not used)
    // - call:ended (Room.jsx handles this)

    return s;
  }, [socketUrl]);

  // Set socket reference for PeerService
  PeerService.setSocket(socket);

  return (
    <SocketContext.Provider value={socket}>
      {props.children}
    </SocketContext.Provider>
  );
};