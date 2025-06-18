import EventEmitter from "events";

class PeerService extends EventEmitter {
  constructor() {
    super();
    this.peer = null;
    this.roomId = null;
    this.socket = null;

    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.isReconnecting = false;
    this.isSettingRemoteDescription = false;

    this.senders = new Map();
    this.pendingCandidates = [];

    this._streamTracking = new Map();
    this.remotePeerId = null;
  }

  setSocket(socket) {
    this.socket = socket;
    this.setupSocketEvents();
  }

  setupSocketEvents() {
    if (!this.socket) return;

    this.socket.off("peer:ice-candidate");

    this.socket.on("peer:ice-candidate", ({ candidate, room }) => {
      if (candidate && this.peer && room === this.roomId) {
        this.addIceCandidate(candidate);
      }
    });
  }

  // ICE Candidate Management
  async addIceCandidate(candidate) {
    try {
      if (this.peer?.remoteDescription && this.peer?.remoteDescription.type) {
        await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error);
      this.emit("error", {
        type: "ice-candidate",
        message: "Error adding ICE candidate",
        error,
      });
    }
  }

  // Offer/Answer Management
  async createOffer() {
    if (!this.peer) {
      throw new Error("No peer connection available");
    }

    try {
      const offer = await this.peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
      });

      await this.peer.setLocalDescription(offer);
      return offer;
    } catch (error) {
      this.emit("error", {
        type: "offer",
        message: "Error creating offer",
        error,
      });
      await this.handleConnectionFailure();
      throw error;
    }
  }

  async createAnswer(offer) {
    if (!this.peer) {
      throw new Error("No peer connection available");
    }
    try {
      await this.peer.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);

      return answer;
    } catch (error) {
      console.error("❌ Error creating answer:", error);
      this.emit("error", {
        type: "answer",
        message: "Error creating answer",
        error,
      });
      await this.handleConnectionFailure();
      throw error;
    }
  }

  async setRemoteDescription(answer) {
    if (!this.peer) {
      console.warn("No peer connection available for setRemoteDescription");
      return;
    }
    if (this.isSettingRemoteDescription) {
      return;
    }
    try {
      this.isSettingRemoteDescription = true;
      const currentState = this.peer.signalingState;
      if (["stable", "have-local-offer"].includes(currentState)) {
        await this.peer.setRemoteDescription(new RTCSessionDescription(answer));

        await this.processPendingCandidates();
      } else {
        const errorMsg = `Invalid signaling state for remote description: ${currentState}`;
        console.warn("⚠️", errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("❌ Error setting remote description:", error);
      this.emit("error", {
        type: "remote-description",
        message: "Connection failed. Please try again.",
        error,
      });
      await this.handleConnectionFailure();
    } finally {
      this.isSettingRemoteDescription = false;
    }
  }

  async processPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      await this.addIceCandidate(candidate);
    }
  }

  async initializePeer(roomId) {
    this.cleanup();

    this.roomId = roomId;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    await this.initializeConnection();
  }

  async initializeConnection() {
    try {
      await this.initializeWithStun();
    } catch (error) {
      console.log(
        "🔄 STUN conn. failed, trying turn fallback",
        error
      );
      try {
        await this.initializeWithTurn();
      } catch (stunError) {
        console.error(
          "❌ Both TURN and STUN initialization failed"
        );
        throw stunError;
      }
    }
  }

async initializeWithStun() {
  try {
    const config = {
      iceServers: [
        {
          urls: [
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun3.l.google.com:19302", 
            "stun:stun4.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
            "stun:stun.relay.metered.ca:80",
          ],
        },
        ...(import.meta.env.VITE_EXPRESSTURN_USERNAME ? [{
          urls: ["turn:relay1.expressturn.com:3478"],
          username: import.meta.env.VITE_EXPRESSTURN_USERNAME,
          credential: import.meta.env.VITE_EXPRESSTURN_CREDENTIAL,
        }] : []),
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };

    await this.createPeerConnection(config);
  } catch (error) {
    console.error("❌ Error initializing STUN connection:", error);
    throw error;
  }
}

  async initializeWithTurn() {
  try {
    const response = await fetch(import.meta.env.VITE_CRED);
    const cloudflareCredentials = await response.json();
    
    const iceServers = [
      {
        urls: cloudflareCredentials.urls,
        username: cloudflareCredentials.username,
        credential: cloudflareCredentials.credential,
      }
    ];
    if (import.meta.env.VITE_METERED_USERNAME) {
      iceServers.push({
        urls: [
          "turn:standard.relay.metered.ca:80",
          "turn:standard.relay.metered.ca:80?transport=tcp",
          "turn:standard.relay.metered.ca:443",
          "turns:standard.relay.metered.ca:443?transport=tcp"
        ],
        username: import.meta.env.VITE_METERED_USERNAME,
        credential: import.meta.env.VITE_METERED_CREDENTIAL,
      });
    }

    const config = {
      iceServers,
      iceTransportPolicy: "relay",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle", 
      rtcpMuxPolicy: "require",
    };

    await this.createPeerConnection(config);
  } catch (error) {
    console.error("❌ Error initializing mixed TURN:", error);
    throw error;
  }
}
  async createPeerConnection(config) {
    if (!config?.iceServers?.length) {
      throw new Error("Invalid configuration: iceServers array is required");
    }

    this.peer = new RTCPeerConnection(config);
    this.setupPeerEvents();
  }
  setRemotePeer(peerId) {
    this.remotePeerId = peerId;
  }
  setupPeerEvents() {
    if (!this.peer) return;

    // ICE candidate handling
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate && this.socket) {
        if (this.remotePeerId) {
          this.socket.emit("peer:ice-candidate", {
            candidate,
            to: this.remotePeerId,
            room: this.roomId,
          });
        }
      }
    };

    this.peer.ontrack = (event) => {
      this.handleIncomingTrack(event);
    };

    // Connection state monitoring
    this.peer.oniceconnectionstatechange = () => {
      const iceState = this.peer?.iceConnectionState;

      switch (iceState) {
        case "connected":
        case "completed":
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit("iceConnected");
          break;
        case "checking":
          if (this.iceTimeout) clearTimeout(this.iceTimeout);
          this.iceTimeout = setTimeout(() => {
            if (this.peer?.iceConnectionState === "checking") {
              this.handleConnectionFailure();
            }
          }, 10000);
          break;
        case "failed":
          if (this.iceTimeout) clearTimeout(this.iceTimeout);
          this.handleConnectionFailure();
          break;
        case "disconnected":
          if (this.iceTimeout) clearTimeout(this.iceTimeout);
          setTimeout(() => {
            if (this.peer?.iceConnectionState === "disconnected") {
              this.handleConnectionFailure();
            }
          }, 3000);
          break;
        default:
      }
    };

    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;

      if (state === "connected") {
        console.log("✅ Peer connection fully established");
      } else if (["failed", "disconnected"].includes(state)) {
        this.handleConnectionFailure();
      }
    };

    // Signaling state changes
    this.peer.onsignalingstatechange = () => {
      console.log("📡 Signaling state:", this.peer?.signalingState);
    };
  }

  // Track Handling
  handleIncomingTrack(event) {
    const stream = event.streams[0];
    if (!stream) {
      return;
    }

    const streamId = stream.id;
    const trackKind = event.track.kind;


    // Get or create tracking info
    let trackingInfo = this._streamTracking.get(streamId);
    if (!trackingInfo) {
      trackingInfo = {
        hasAudio: false,
        hasVideo: false,
        emitted: false,
        timeoutId: null,
        stream: stream,
      };
      this._streamTracking.set(streamId, trackingInfo);
    }

    // Update tracking
    if (trackKind === "audio") {
      trackingInfo.hasAudio = true;
    } else if (trackKind === "video") {
      trackingInfo.hasVideo = true;
    }

    // Clear existing timeout
    if (trackingInfo.timeoutId) {
      clearTimeout(trackingInfo.timeoutId);
    }

    // Emit stream when we have both tracks or after timeout
    trackingInfo.timeoutId = setTimeout(() => {
      if (!trackingInfo.emitted) {
        trackingInfo.emitted = true;
        this.emit("remoteStream", { stream: trackingInfo.stream });
      }
    }, 1000); // Wait 1 second for both tracks
  }

  // Track Management
  async addTracks(stream) {
    if (!this.peer || !stream) {
      console.error("❌ No peer connection or stream available");
      return;
    }

    try {
      for (const sender of this.senders.values()) {
        try {
          this.peer.removeTrack(sender);
        } catch (e) {
          console.warn("⚠️ Error removing existing track:", e.message);
        }
      }
      this.senders.clear();

      // Add new tracks
      const tracks = stream.getTracks();
      tracks.forEach((track) => {
        try {
          const sender = this.peer.addTrack(track, stream);
          this.senders.set(track.kind, sender);
        } catch (e) {
          console.error(`❌ Error adding ${track.kind} track:`, e);
        }
      });

    } catch (error) {
      console.error("❌ Error managing tracks:", error);
      this.emit("error", {
        type: "add-tracks",
        message: "Error adding tracks",
        error,
      });
    }
  }

  // Connection Recovery
  async handleConnectionFailure() {
    if (this.isReconnecting) {
      return;
    }
    if (this.reconnectAttempts === 0 && this.lastUsedConfig !== "turn") {
      this.isReconnecting = true;
      this.reconnectAttempts++;

      try {
        const currentRemotePeer = this.remotePeerId;
        const currentRoom = this.roomId;
        await this.cleanup();
        await this.initializeWithTurn();
        this.lastUsedConfig = "turn";
        this.remotePeerId = currentRemotePeer;
        this.roomId = currentRoom;
        if (this.remotePeerId && this.roomId) {
          this.emit("reconnectCall");
        }
        this.isReconnecting = false;
        return;
      } catch (error) {
        console.error("❌ TURN fallback failed:", error);
        this.isReconnecting = false;
      }
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached");
      this.emit("error", {
        type: "reconnect",
        message: "Connection failed. Please refresh and try again.",
      });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      10000
    );
    setTimeout(async () => {
      try {
        await this.cleanup();
        if (this.reconnectAttempts % 2 === 0) {
          await this.initializeWithTurn();
          this.lastUsedConfig = "turn";
        } else {
          await this.initializeWithStun();
          this.lastUsedConfig = "stun";
        }

        if (this.remotePeerId && this.roomId) {
          this.emit("reconnectCall");
        }

        this.isReconnecting = false;
      } catch (error) {
        console.error("❌ Reconnection failed:", error);
        this.isReconnecting = false;
        setTimeout(() => this.handleConnectionFailure(), 1000);
      }
    }, delay);
  }

  // Utility Methods
  async switchMediaSource(newStream) {
    if (!this.peer) {
      console.error("❌ No peer connection available for media switch");
      return;
    }
    console.log("🔄 Switching media source");
    await this.addTracks(newStream);
    this.emit("media-source-switched", { newStream });
  }

  async waitForStableState(timeout = 5000) {
    if (!this.peer || this.peer.signalingState === "stable") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timeout waiting for stable signaling state"));
      }, timeout);

      const checkState = () => {
        if (!this.peer || this.peer.signalingState === "stable") {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(checkState, 100);
        }
      };

      checkState();
    });
  }

  // Cleanup
  cleanup() {
    for (const trackingInfo of this._streamTracking.values()) {
      if (trackingInfo.timeoutId) {
        clearTimeout(trackingInfo.timeoutId);
      }
    }
    this._streamTracking.clear();

    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onicecandidate = null;
      this.peer.oniceconnectionstatechange = null;
      this.peer.onconnectionstatechange = null;
      this.peer.onsignalingstatechange = null;
      this.remotePeerId = null;

      this.peer.close();
      this.peer = null;
    }

    this.senders.clear();
    this.pendingCandidates.length = 0;
    this.roomId = null;
    this.isReconnecting = false;
    this.isSettingRemoteDescription = false;
    this.reconnectAttempts = 0;
  }
  get connectionState() {
    return this.peer?.connectionState || "closed";
  }

  get iceConnectionState() {
    return this.peer?.iceConnectionState || "closed";
  }

  get signalingState() {
    return this.peer?.signalingState || "closed";
  }
}

export default new PeerService();
