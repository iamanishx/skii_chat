import { useEffect, useCallback, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";
import { useAuth } from "../context/AuthProvider";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  Copy,
  Users,
  Settings,
  Monitor,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import PeerService from "../service/peer";

const RoomPage = () => {
  const socket = useSocket();
  const { room } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Stream and connection states
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCallInProgress, setIsCallInProgress] = useState(false);
  const [connectionState, setConnectionState] = useState("new");
  
  // UI states
  const [isCopied, setIsCopied] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(null);
  const [participants, setParticipants] = useState([]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Auto-hide controls after 3 seconds of inactivity
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const validateStream = useCallback((stream) => {
    if (!stream) {
      console.error("Stream is null or undefined.");
      return false;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    if (!videoTracks.length && !audioTracks.length) {
      console.error("Stream does not contain any valid tracks.");
      return false;
    }

    return true;
  }, []);

  const initializeLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 1280, height: 720 },
      });

      if (validateStream(stream)) {
        setMyStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } else {
        throw new Error("Invalid stream received");
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setError("Failed to access camera and microphone. Please check your permissions.");
      throw error;
    }
  }, [validateStream]);

  const cleanupStreams = useCallback(() => {
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }
    PeerService.cleanup();
    setRemoteStream(null);
    setIsCallInProgress(false);
    setConnectionState("new");
  }, [myStream]);

  // Media Controls
  const toggleAudio = useCallback(() => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, [myStream]);

  const toggleVideo = useCallback(() => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, [myStream]);

  const endCall = useCallback(() => {
    cleanupStreams();
    navigate("/home");
  }, [cleanupStreams, navigate]);

  const copyRoomLink = useCallback(async () => {
    try {
      const link = `${window.location.origin}/room/${room}`;
      await navigator.clipboard.writeText(link);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy room link:", err);
    }
  }, [room]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Call Management
  const handleIncomingCall = useCallback(
    async ({ from, offer }) => {
      try {
        setError(null);
        setRemoteSocketId(from);
        setIsCallInProgress(true);
        
        // Ensure we have local stream
        let stream = myStream;
        if (!stream) {
          stream = await initializeLocalStream();
        }
        
        await PeerService.cleanup();
        await PeerService.initializePeer(room);
        PeerService.setRemotePeer(from);
        
        if (stream) {
          await PeerService.addTracks(stream);
        }
        
        const answer = await PeerService.createAnswer(offer);
        if (answer) {
          socket.emit("call:accepted", { to: from, answer, room });
        }
      } catch (error) {
        console.error("Error handling incoming call:", error);
        setError("Failed to accept the call. Please try again.");
        cleanupStreams();
      }
    },
    [socket, room, myStream, initializeLocalStream, cleanupStreams]
  );

  const sendStreams = useCallback(async () => {
    if (myStream && PeerService.peer) {
      try {
        await PeerService.addTracks(myStream);
      } catch (error) {
        console.error("Error sending streams:", error);
        setError("Failed to send video stream.");
      }
    }
  }, [myStream]);

  const handleCallAccepted = useCallback(
    async ({ answer }) => {
      try {
        await PeerService.setRemoteDescription(answer);
        await sendStreams();
      } catch (error) {
        console.error("Error handling call accepted:", error);
        setError("Connection failed. Please try again.");
      }
    },
    [sendStreams]
  );

  const handleNegoIncoming = useCallback(
    async ({ from, offer }) => {
      try {
        const answer = await PeerService.createAnswer(offer);
        socket.emit("peer:nego:done", { to: from, answer });
      } catch (error) {
        console.error("Error handling incoming negotiation:", error);
      }
    },
    [socket]
  );

  const handleNegoFinal = useCallback(
    async ({ answer }) => {
      try {
        await PeerService.setRemoteDescription(answer);
      } catch (error) {
        console.error("Error in final negotiation:", error);
      }
    },
    []
  );

  const handleUserJoined = useCallback(
    ({ email, id, room: joinedRoom }) => {
      console.log(`User ${email} joined with ID: ${id}`);
      if (joinedRoom === room) {
        setRemoteSocketId(id);
        setParticipants(prev => [...prev.filter(p => p.id !== id), { email, id }]);
      }
    },
    [room]
  );

  const handleCallUser = useCallback(async () => {
    if (!remoteSocketId) return;
    
    try {
      setError(null);
      setIsCallInProgress(true);
      
      // Ensure we have local stream
      let stream = myStream;
      if (!stream) {
        stream = await initializeLocalStream();
      }
      
      await PeerService.cleanup();
      await PeerService.initializePeer(room);
      PeerService.setRemotePeer(remoteSocketId);
      
      if (stream) {
        await PeerService.addTracks(stream);
      }
      
      const offer = await PeerService.createOffer();
      if (offer) {
        socket.emit("user:call", { to: remoteSocketId, offer, room });
      }
    } catch (error) {
      console.error("Error initiating call:", error);
      setError("Failed to start the call. Please try again.");
      setIsCallInProgress(false);
    }
  }, [remoteSocketId, socket, room, myStream, initializeLocalStream]);

  // Automatically start call when a peer joins
  useEffect(() => {
    if (remoteSocketId && !isCallInProgress) {
      handleCallUser();
    }
  }, [remoteSocketId, isCallInProgress, handleCallUser]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const eventHandlers = {
      "user:joined": handleUserJoined,
      "incoming:call": handleIncomingCall,
      "call:accepted": handleCallAccepted,
      "peer:nego:needed": handleNegoIncoming,
      "peer:nego:final": handleNegoFinal,
    };

    // Register event listeners
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      // Cleanup event listeners
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [socket, handleUserJoined, handleIncomingCall, handleCallAccepted, handleNegoIncoming, handleNegoFinal]);

  // PeerService event listeners
  useEffect(() => {
    const handleRemoteStream = ({ stream }) => {
      console.log("Received remote stream");
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    const handleIceConnected = () => {
      setConnectionState("connected");
      setError(null);
    };

    const handlePeerError = ({ message }) => {
      setError(message);
    };

    const handleReconnectCall = async () => {
      if (remoteSocketId && myStream) {
        try {
          await PeerService.addTracks(myStream);
          const offer = await PeerService.createOffer();
          if (offer) {
            socket.emit("user:call", { to: remoteSocketId, offer, room });
            setIsCallInProgress(true);
          }
        } catch (error) {
          console.error("❌ Reconnection call failed:", error);
          setError("Reconnection failed. Please try again.");
        }
      }
    };

    // Add peer connection negotiation handler
    const handleNegoNeeded = async () => {
      if (PeerService.peer && remoteSocketId) {
        try {
          const offer = await PeerService.createOffer();
          socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
        } catch (error) {
          console.error("Error in negotiation needed:", error);
        }
      }
    };

    // Set up peer connection negotiation
    if (PeerService.peer) {
      PeerService.peer.onnegotiationneeded = handleNegoNeeded;
    }

    PeerService.on("remoteStream", handleRemoteStream);
    PeerService.on("iceConnected", handleIceConnected);
    PeerService.on("error", handlePeerError);
    PeerService.on("reconnectCall", handleReconnectCall);

    return () => {
      PeerService.off("remoteStream", handleRemoteStream);
      PeerService.off("iceConnected", handleIceConnected);
      PeerService.off("error", handlePeerError);
      PeerService.off("reconnectCall", handleReconnectCall);
    };
  }, [socket, room, remoteSocketId, myStream]);

  // Join room on mount
  useEffect(() => {
    if (socket && room && user?.email) {
      socket.emit("room:join", { email: user.email, room });
      PeerService.setSocket(socket);
      
      // Initialize local stream when joining room
      initializeLocalStream().catch(error => {
        console.error("Failed to initialize local stream:", error);
      });
    }
  }, [socket, room, user?.email, initializeLocalStream]);

  // Mouse movement handler for showing controls
  useEffect(() => {
    const handleMouseMove = () => resetControlsTimeout();
    
    document.addEventListener("mousemove", handleMouseMove);
    resetControlsTimeout();
    
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStreams();
    };
  }, [cleanupStreams]);

  // Set local video stream when available
  useEffect(() => {
    if (localVideoRef.current && myStream) {
      const videoElement = localVideoRef.current;
      if (videoElement.srcObject !== myStream) {
        videoElement.srcObject = myStream;
        videoElement.play().catch((error) => {
          console.error("❌ Error playing local video:", error);
        });
      }
    }
  }, [myStream]);

  // Set remote video stream when available
  useEffect(() => {
    if (!remoteVideoRef.current || !remoteStream) return;

    const videoElement = remoteVideoRef.current;
    if (videoElement.srcObject !== remoteStream) {
      videoElement.srcObject = remoteStream;
    }

    const attemptPlay = () => {
      videoElement
        .play()
        .then(() => {
          console.log("✅ Remote video playing successfully!");
        })
        .catch((error) => {
          console.error("❌ Remote video play failed:", error.name);
          // Try with muted if autoplay fails
          videoElement.muted = true;
          videoElement.play().catch((e) => {
            console.error("❌ Even muted remote video failed:", e);
          });
        });
    };

    if (connectionState === "connected") {
      attemptPlay();
    } else {
      const fallbackTimeout = setTimeout(attemptPlay, 2000);
      return () => clearTimeout(fallbackTimeout);
    }
  }, [remoteStream, connectionState]);

  return (
    <div className="h-screen bg-gray-900 relative overflow-hidden">
      {/* Header */}
      <div className={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/60 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/home")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-white font-semibold">Room: {room}</h1>
              <p className="text-gray-300 text-sm">{participants.length + 1} participant{participants.length !== 0 ? 's' : ''}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={copyRoomLink}
              className="flex items-center space-x-2 bg-blue-600/80 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="text-sm">{isCopied ? "Copied!" : "Share"}</span>
            </button>
            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <MoreVertical className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Video Area */}
      <div className="h-full relative">
        {/* Remote Video (Main) */}
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-white text-xl font-semibold mb-2">
                {remoteSocketId ? "Connecting..." : "Waiting for others to join"}
              </h2>
              <p className="text-gray-400">
                {remoteSocketId ? "Setting up video connection" : "Share the room link to invite others"}
              </p>
            </div>
          </div>
        )}

        {/* Local Video (Picture-in-Picture) */}
        <div className="absolute top-20 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg border-2 border-gray-700">
          {myStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Video className="w-8 h-8 text-gray-500" />
            </div>
          )}
          
          {/* Local video controls overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex justify-center space-x-1">
            <div className={`p-1 rounded ${!isVideoEnabled ? 'bg-red-500' : 'bg-gray-700'}`}>
              {isVideoEnabled ? (
                <Video className="w-3 h-3 text-white" />
              ) : (
                <VideoOff className="w-3 h-3 text-white" />
              )}
            </div>
            <div className={`p-1 rounded ${!isAudioEnabled ? 'bg-red-500' : 'bg-gray-700'}`}>
              {isAudioEnabled ? (
                <Mic className="w-3 h-3 text-white" />
              ) : (
                <MicOff className="w-3 h-3 text-white" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent p-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex justify-center items-center space-x-4">
          {/* Audio Toggle */}
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-all duration-200 ${
              isAudioEnabled
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {isAudioEnabled ? (
              <Mic className="w-6 h-6" />
            ) : (
              <MicOff className="w-6 h-6" />
            )}
          </button>

          {/* Video Toggle */}
          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all duration-200 ${
              isVideoEnabled
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {isVideoEnabled ? (
              <Video className="w-6 h-6" />
            ) : (
              <VideoOff className="w-6 h-6" />
            )}
          </button>

          {/* Call/End Call Button */}
          {remoteSocketId && !isCallInProgress ? (
            <button
              onClick={handleCallUser}
              className="p-4 rounded-full bg-green-600 hover:bg-green-700 text-white transition-all duration-200"
            >
              <Phone className="w-6 h-6" />
            </button>
          ) : isCallInProgress ? (
            <button
              onClick={endCall}
              className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          ) : null}

          {/* Screen Share */}
          <button
            onClick={toggleFullscreen}
            className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all duration-200"
          >
            <Monitor className="w-6 h-6" />
          </button>

          {/* Settings */}
          <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all duration-200">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Connection Status */}
      {connectionState !== "connected" && isCallInProgress && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-6 py-4 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            <span>Connecting...</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="absolute top-24 left-4 right-4 bg-red-600/90 text-white p-4 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-white hover:text-gray-200"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
