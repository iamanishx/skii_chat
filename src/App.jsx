import { useState } from 'react'
import Login from "./pages/Login";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <Router>
    <Routes>
       <Route path="/" element={<Login />} />
    </Routes>
  </Router>
  )
}

export default App
