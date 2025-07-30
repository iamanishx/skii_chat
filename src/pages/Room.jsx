import { useEffect, useCallback, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";
import {
  Check,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  Copy,
  AlertCircle,
} from "lucide-react";
import PeerService from "../service/peer";

const RoomPage = () => {
  const socket = useSocket();
  const { room } = useParams();

  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [roomLink, setRoomLink] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isCallInProgress, setIsCallInProgress] = useState(false);
  const [error, setError] = useState(null);
  const [iceConnectionState, setIceConnectionState] = useState("new");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

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
        return stream;
      } else {
        throw new Error("Invalid local stream.");
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setError(
        "Failed to access camera and microphone. Please check your permissions."
      );
      throw error;
    }
  }, [validateStream]);

  const cleanupStreams = useCallback(() => {
    if (myStream) {
      myStream.getTracks().forEach((track) => {
        track.stop();
      });
      setMyStream(null);
    }

    PeerService.cleanup();
    setRemoteStream(null);
    setIsCallInProgress(false);
    setIceConnectionState("new");
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

  // Call Management
  // In handleIncomingCall:
  const handleIncomingCall = useCallback(
    async ({ from, offer }) => {
      try {
        setError(null);
        setRemoteSocketId(from);
        const stream = await initializeLocalStream();

        await PeerService.cleanup();
        await PeerService.initializePeer(room);
        PeerService.setRemotePeer(from); 
        await PeerService.addTracks(stream);

        const answer = await PeerService.createAnswer(offer);
        if (answer) {
          socket.emit("call:accepted", { to: from, answer, room });
          setIsCallInProgress(true);
        }
      } catch (error) {
        console.error("❌ Error in handleIncomingCall:", error);
        setError("Failed to accept call. Please try again.");
        cleanupStreams();
      }
    },
    [socket, room, initializeLocalStream, cleanupStreams]
  );

  // In handleCallUser:
  const handleCallUser = useCallback(async () => {
    if (!remoteSocketId) {
      setError("No peer available to call");
      return;
    }

    try {
      setError(null);
      const stream = await initializeLocalStream();
      await PeerService.initializePeer(room);
      PeerService.setRemotePeer(remoteSocketId); 
      await PeerService.addTracks(stream);

      const offer = await PeerService.createOffer();
      if (offer) {
        socket.emit("user:call", { to: remoteSocketId, offer, room });
        setIsCallInProgress(true);
      }
    } catch (error) {
      console.error("❌ Error in handleCallUser:", error);
      setError("Failed to start call. Please try again.");
      cleanupStreams();
    }
  }, [remoteSocketId, room, socket, initializeLocalStream, cleanupStreams]);

  const handleCallAccepted = useCallback(
    async ({ answer }) => {
      try {
        await PeerService.setRemoteDescription(answer);
      } catch (error) {
        console.error("❌ Error in handleCallAccepted:", error);
        setError("Failed to establish connection. Please try again.");
        cleanupStreams();
      }
    },
    [cleanupStreams]
  );

  // Socket Event Handlers
  const handleUserJoined = useCallback(
  ({ id, room: joinedRoom }) => {    
    if (joinedRoom === room) {
      setRemoteSocketId(id);
    }
  },
  [room]
);
  const handleCallEnded = useCallback(() => {
    cleanupStreams();
  }, [cleanupStreams]);

  // UI Helpers
  const copyRoomLink = useCallback(() => {
    navigator.clipboard.writeText(roomLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [roomLink]);

  // Effects
  // Initialize room connection
  useEffect(() => {
    if (socket && room) {
      const email =
        localStorage.getItem("userEmail") || `user-${Date.now()}@example.com`;
      socket.emit("room:join", { room, email });
      PeerService.setSocket(socket);
      setRoomLink(window.location.href);
    }
    return () => {
      cleanupStreams();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, room]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const eventHandlers = {
      "user:joined": handleUserJoined,
      "incoming:call": handleIncomingCall,
      "call:accepted": handleCallAccepted,
      "call:ended": handleCallEnded,
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
  }, [
    socket,
    handleUserJoined,
    handleIncomingCall,
    handleCallAccepted,
    handleCallEnded,
  ]);

  // PeerService event listeners
 useEffect(() => {
  const handlePeerError = ({ type, message }) => {
    console.error(`💥 Peer error (${type}):`, message);
    setError(`Connection error: ${message}`);
  };

  const handleRemoteStream = ({ stream }) => {
    setRemoteStream(stream);
  };

  const handleICEConnected = () => {
    setIceConnectionState("connected");
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

  const events = [
    ["error", handlePeerError],
    ["remoteStream", handleRemoteStream],
    ["iceConnected", handleICEConnected],
    ["reconnectCall", handleReconnectCall], // ADD THIS LINE
  ];

  events.forEach(([event, handler]) => {
    PeerService.on(event, handler);
  });

  return () => {
    events.forEach(([event, handler]) => {
      PeerService.off(event, handler);
    });
  };
}, [remoteSocketId, myStream, socket, room]);

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

          videoElement.controls = true;
          videoElement.muted = true;

          videoElement.play().catch((e) => {
            console.error("❌ Even muted remote video failed:", e);
          });
        });
    };

    if (iceConnectionState === "connected") {
      attemptPlay();
    } else {
      const fallbackTimeout = setTimeout(attemptPlay, 2000);
      return () => clearTimeout(fallbackTimeout);
    }
  }, [remoteStream, iceConnectionState]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white relative overflow-hidden">
      {/* Error Alert */}
      {error && (
        <div className="absolute top-4 left-4 right-4 z-50 bg-red-600/90 backdrop-blur-sm text-white p-4 rounded-xl shadow-lg border border-red-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-white/80 hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/60 via-black/30 to-transparent p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Room: {room}</h1>
            <p className="text-gray-300 text-sm">
              {remoteSocketId ? "Connected with peer" : "Waiting for someone to join..."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-black/40 backdrop-blur-sm rounded-lg overflow-hidden">
              <input
                type="text"
                value={roomLink}
                readOnly
                className="bg-transparent px-4 py-2 text-sm text-white placeholder-gray-400 border-none outline-none w-64"
                placeholder="Room link"
              />
              <button
                onClick={copyRoomLink}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 transition-colors flex items-center gap-2"
                title="Copy room link"
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
                <span className="text-sm">{isCopied ? "Copied!" : "Share"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Video Container */}
      <div className="h-screen flex items-center justify-center p-6 pt-32 pb-24">
        <div className="w-full max-w-7xl mx-auto">
          {/* Video Grid - 1:1 Aspect Ratio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full max-h-[calc(100vh-200px)]">
            {/* Local Video */}
            {myStream && (
              <div className="relative group">
                <div className="aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700/50 relative">
                  <video
                    ref={localVideoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Video Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  
                  {/* Local Video Label */}
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-lg">
                    <span className="text-white text-sm font-medium">You</span>
                  </div>

                  {/* Video State Indicators */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <div className={`p-2 rounded-lg backdrop-blur-sm ${!isVideoEnabled ? 'bg-red-500/80' : 'bg-gray-900/60'}`}>
                      {isVideoEnabled ? (
                        <Video className="w-4 h-4 text-white" />
                      ) : (
                        <VideoOff className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className={`p-2 rounded-lg backdrop-blur-sm ${!isAudioEnabled ? 'bg-red-500/80' : 'bg-gray-900/60'}`}>
                      {isAudioEnabled ? (
                        <Mic className="w-4 h-4 text-white" />
                      ) : (
                        <MicOff className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>

                  {/* Video disabled overlay */}
                  {!isVideoEnabled && (
                    <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mb-4 mx-auto">
                          <VideoOff className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-400 text-sm">Camera is off</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Remote Video */}
            <div className="relative group">
              <div className="aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700/50 relative">
                {remoteStream ? (
                  <>
                    <video
                      ref={remoteVideoRef}
                      className="w-full h-full object-cover"
                      autoPlay
                      playsInline
                      muted={false}
                    />
                    {/* Video Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                    
                    {/* Remote Video Label */}
                    <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-lg">
                      <span className="text-white text-sm font-medium">Remote</span>
                    </div>

                    {/* Connection Status */}
                    <div className="absolute top-4 right-4">
                      <div className={`px-3 py-1 rounded-lg backdrop-blur-sm text-xs font-medium ${
                        iceConnectionState === "connected" 
                          ? "bg-green-500/80 text-white" 
                          : "bg-yellow-500/80 text-white"
                      }`}>
                        {iceConnectionState === "connected" ? "Connected" : "Connecting..."}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6 mx-auto">
                        <Video className="w-12 h-12 text-gray-600" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">
                        {remoteSocketId ? "Connecting..." : "Waiting for peer"}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        {remoteSocketId ? "Setting up video connection" : "Share the room link to invite others"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6">
        <div className="flex justify-center items-center gap-4">
          {myStream && (
            <>
              {/* Audio Control */}
              <button
                onClick={toggleAudio}
                className={`p-4 rounded-full transition-all duration-200 shadow-lg backdrop-blur-sm ${
                  isAudioEnabled
                    ? "bg-gray-800/80 hover:bg-gray-700/80 text-white border border-gray-600/50"
                    : "bg-red-600/80 hover:bg-red-700/80 text-white border border-red-500/50"
                }`}
                title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
              </button>

              {/* Video Control */}
              <button
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all duration-200 shadow-lg backdrop-blur-sm ${
                  isVideoEnabled
                    ? "bg-gray-800/80 hover:bg-gray-700/80 text-white border border-gray-600/50"
                    : "bg-red-600/80 hover:bg-red-700/80 text-white border border-red-500/50"
                }`}
                title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
              </button>

              {/* End Call */}
              <button
                onClick={cleanupStreams}
                className="p-4 rounded-full bg-red-600/80 hover:bg-red-700/80 text-white transition-all duration-200 shadow-lg backdrop-blur-sm border border-red-500/50"
                title="End call"
              >
                <PhoneOff size={24} />
              </button>
            </>
          )}

          {/* Start Call Button */}
          {remoteSocketId && !myStream && (
            <button
              onClick={handleCallUser}
              disabled={isCallInProgress}
              className="px-8 py-4 bg-green-600/80 hover:bg-green-700/80 text-white rounded-full transition-all duration-200 flex items-center gap-3 shadow-lg backdrop-blur-sm border border-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Phone size={24} />
              <span className="font-medium">
                {isCallInProgress ? "Starting Call..." : "Start Call"}
              </span>
            </button>
          )}
        </div>

        {/* Connection Status Bar */}
        <div className="flex justify-center mt-4">
          <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-700/50">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-300">
                ICE: <span className={`font-medium ${
                  iceConnectionState === "connected" ? "text-green-400" : "text-yellow-400"
                }`}>
                  {iceConnectionState}
                </span>
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">
                Room: <span className="font-medium text-white">{room}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
