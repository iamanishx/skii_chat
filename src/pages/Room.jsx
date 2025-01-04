import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import { X, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Copy } from "lucide-react";

const RoomPage = () => {
  const socket = useSocket();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [roomLink, setRoomLink] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const offer = await peer.getOffer();
    socket.emit("user:call", { to: remoteSocketId, offer });
    setMyStream(stream);
  }, [remoteSocketId, socket]);

  const handleEndCall = useCallback(() => {
    myStream?.getTracks().forEach(track => track.stop());
    setMyStream(null);
    setRemoteStream(null);
    peer.peer.close();
    socket.emit("call:end", { to: remoteSocketId });
  }, [myStream, remoteSocketId, socket]);

  const toggleAudio = useCallback(() => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
    }
  }, [myStream]);

  const toggleVideo = useCallback(() => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
    }
  }, [myStream]);

  const copyRoomLink = useCallback(() => {
    const link = `${window.location.origin}/room/${socket.id}`;
    navigator.clipboard.writeText(link);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [socket.id]);

    const handleIncommingCall = useCallback(
      async ({ from, offer }) => {
        setRemoteSocketId(from);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        setMyStream(stream);
        console.log(`Incoming Call`, from, offer);
        const ans = await peer.getAnswer(offer);
        socket.emit("call:accepted", { to: from, ans });
      },
      [socket]
    );
  
    const sendStreams = useCallback(() => {
      for (const track of myStream.getTracks()) {
        peer.peer.addTrack(track, myStream);
      }
    }, [myStream]);
  
    const handleCallAccepted = useCallback(
      ({ from, ans }) => {
        peer.setLocalDescription(ans);
        console.log("Call Accepted!");
        sendStreams();
      },
      [sendStreams]
    );
  
    const handleNegoNeeded = useCallback(async () => {
      const offer = await peer.getOffer();
      socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
    }, [remoteSocketId, socket]);
  
    useEffect(() => {
      peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
      return () => {
        peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
      };
    }, [handleNegoNeeded]);
  
    const handleNegoNeedIncomming = useCallback(
      async ({ from, offer }) => {
        const ans = await peer.getAnswer(offer);
        socket.emit("peer:nego:done", { to: from, ans });
      },
      [socket]
    );
  
    const handleNegoNeedFinal = useCallback(async ({ ans }) => {
      await peer.setLocalDescription(ans);
    }, []);
  
    useEffect(() => {
      peer.peer.addEventListener("track", async (ev) => {
        const remoteStream = ev.streams;
        console.log("GOT TRACKS!!");
        setRemoteStream(remoteStream[0]);
      });
    }, []);
  
    useEffect(() => {
      socket.on("user:joined", handleUserJoined);
      socket.on("incomming:call", handleIncommingCall);
      socket.on("call:accepted", handleCallAccepted);
      socket.on("peer:nego:needed", handleNegoNeedIncomming);
      socket.on("peer:nego:final", handleNegoNeedFinal);
  
      return () => {
        socket.off("user:joined", handleUserJoined);
        socket.off("incomming:call", handleIncommingCall);
        socket.off("call:accepted", handleCallAccepted);
        socket.off("peer:nego:needed", handleNegoNeedIncomming);
        socket.off("peer:nego:final", handleNegoNeedFinal);
      };
    }, [
      socket,
      handleUserJoined,
      handleIncommingCall,
      handleCallAccepted,
      handleNegoNeedIncomming,
      handleNegoNeedFinal,
    ]);
  

  useEffect(() => {
    setRoomLink(`${window.location.origin}/room/${socket.id}`);
  }, [socket.id]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Video Chat Room</h1>
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              value={roomLink} 
              readOnly 
              className="bg-gray-50 px-4 py-2 rounded-lg text-sm w-64"
            />
            <button
              onClick={copyRoomLink}
              className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              {isCopied ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex justify-center gap-4">
            {myStream && (
              <div className="flex gap-2">
                <button
                  onClick={toggleAudio}
                  className={`p-3 rounded-full ${
                    isAudioEnabled ? 'bg-blue-500' : 'bg-red-500'
                  } text-white`}
                >
                  {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full ${
                    isVideoEnabled ? 'bg-blue-500' : 'bg-red-500'
                  } text-white`}
                >
                  {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
                <button
                  onClick={handleEndCall}
                  className="p-3 rounded-full bg-red-500 text-white"
                >
                  <PhoneOff size={20} />
                </button>
              </div>
            )}
            {remoteSocketId && !myStream && (
              <button
                onClick={handleCallUser}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Phone size={20} />
                Start Call
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myStream && (
              <div className="relative">
                <h2 className="text-lg font-semibold mb-2">Your Video</h2>
                <div className="rounded-lg overflow-hidden bg-gray-900">
                  <ReactPlayer
                    playing
                    muted
                    height="300px"
                    width="100%"
                    url={myStream}
                  />
                </div>
              </div>
            )}
            {remoteStream && (
              <div className="relative">
                <h2 className="text-lg font-semibold mb-2">Remote Video</h2>
                <div className="rounded-lg overflow-hidden bg-gray-900">
                  <ReactPlayer
                    playing
                    height="300px"
                    width="100%"
                    url={remoteStream}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-gray-600">
          {remoteSocketId ? (
            <p>Connected with peer</p>
          ) : (
            <p>Waiting for someone to join...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomPage;