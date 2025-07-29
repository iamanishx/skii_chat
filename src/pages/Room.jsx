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
import { Alert, AlertDescription } from "../assets/ui/alert";
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
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Video Chat Room</h1>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              value={roomLink}
              readOnly
              className="bg-gray-50 px-4 py-2 rounded-lg text-sm flex-1 md:w-64"
            />
            <button
              onClick={copyRoomLink}
              className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition-colors"
              title="Copy room link"
            >
              {isCopied ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mb-6">
          {myStream && (
            <div className="flex gap-2">
              <button
                onClick={toggleAudio}
                className={`p-3 rounded-full transition-colors ${
                  isAudioEnabled
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-red-500 hover:bg-red-600"
                } text-white`}
                title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-full transition-colors ${
                  isVideoEnabled
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-red-500 hover:bg-red-600"
                } text-white`}
                title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button
                onClick={cleanupStreams}
                className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
                title="End call"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          )}

          {remoteSocketId && !myStream && (
            <button
              onClick={handleCallUser}
              disabled={isCallInProgress}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Phone size={20} />
              {isCallInProgress ? "Calling..." : "Start Call"}
            </button>
          )}
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {myStream && (
            <div className="relative">
              <h2 className="text-lg font-semibold mb-2">Your Video</h2>
              <video
                ref={localVideoRef}
                className="rounded-lg bg-gray-900 w-full"
                height="300"
                autoPlay
                playsInline
                muted
              />
            </div>
          )}

          {remoteStream && (
            <div className="relative">
              <h2 className="text-lg font-semibold mb-2">Remote Video</h2>
              <video
                ref={remoteVideoRef}
                className="rounded-lg bg-gray-900 w-full"
                autoPlay
                playsInline
                muted={false}
                style={{
                  minHeight: "240px",
                }}
              />
            </div>
          )}
        </div>

        {/* Status */}
        <div className="text-center text-gray-600">
          <div className="flex justify-center items-center gap-4 text-sm">
            <span>
              ICE:{" "}
              <span
                className={`font-bold ${
                  iceConnectionState === "connected"
                    ? "text-green-600"
                    : "text-orange-500"
                }`}
              >
                {iceConnectionState}
              </span>
            </span>
            <span>•</span>
            <span>
              {remoteSocketId
                ? "Connected with peer"
                : "Waiting for someone to join..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
