import { useState } from 'react'
import Login from "./pages/Login";
import Home from "./pages/Home";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './App.css'
import { SocketProvider } from "./context/SocketProvider";
import RoomPage from './pages/Room';


function App() {
  return (
    <SocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/room/:room" element={<RoomPage/>} />
        </Routes>
      </Router>
    </SocketProvider>
  );
}

export default App
