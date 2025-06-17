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
        s.on("connect", () => {
      console.log("🔌 Socket connected:", s.id);
    });
    
    s.on("disconnect", () => {
      console.log("🔌 Socket disconnected");
    });
    s.on("user:joined", ({ id, room, email }) => {
      console.log(`New user joined room ${room} with ID:`, id);
    });
    return s;
  }, [socketUrl]);
  PeerService.setSocket(socket);

  return (
    <SocketContext.Provider value={socket}>
      {props.children}
    </SocketContext.Provider>
  );
};