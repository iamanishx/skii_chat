import EventEmitter from "events";

class PeerService extends EventEmitter {
  constructor() {
    super();
    // Core properties
    this.peer = null;
    this.roomId = null;
    this.socket = null;

    // Connection management
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.isReconnecting = false;
    this.isSettingRemoteDescription = false;

    // Track management
    this.senders = new Map();
    this.pendingCandidates = [];

    // Stream tracking to prevent duplicates
    this._streamTracking = new Map();
    this.remotePeerId = null;
  }

  // Socket Management
  setSocket(socket) {
    this.socket = socket;
    this.setupSocketEvents();
  }

  setupSocketEvents() {
    if (!this.socket) return;

    // Clean up existing listeners first
    this.socket.off("peer:ice-candidate");

    // Set up ICE candidate handling
    this.socket.on("peer:ice-candidate", ({ candidate }) => {
      if (candidate && this.peer) {
        this.addIceCandidate(candidate);
      }
    });
  }

  // ICE Candidate Management
  async addIceCandidate(candidate) {
    try {
      // Only add if we have a remote description
      if (this.peer?.remoteDescription && this.peer?.remoteDescription.type) {
        await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("✅ Added ICE candidate successfully");
      } else {
        // Store for later if no remote description yet
        this.pendingCandidates.push(candidate);
        console.log("📦 Stored ICE candidate for later");
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
      console.log("📤 Creating offer...");
      const offer = await this.peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
      });

      await this.peer.setLocalDescription(offer);
      console.log("✅ Offer created and local description set");
      return offer;
    } catch (error) {
      console.error("❌ Error creating offer:", error);
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
      console.log("📥 Creating answer for received offer...");
      await this.peer.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);

      console.log("✅ Answer created and descriptions set");
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

    // Prevent concurrent calls
    if (this.isSettingRemoteDescription) {
      console.log("⏳ Already setting remote description, skipping");
      return;
    }

    try {
      this.isSettingRemoteDescription = true;
      const currentState = this.peer.signalingState;
      console.log(
        "🔄 Setting remote description, current state:",
        currentState
      );

      // Only proceed if in valid state
      if (["stable", "have-local-offer"].includes(currentState)) {
        await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("✅ Remote description set successfully");

        // Process any pending ICE candidates
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

    console.log(
      `🔄 Processing ${this.pendingCandidates.length} pending ICE candidates`
    );

    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      await this.addIceCandidate(candidate);
    }
  }

  // Connection Initialization
  async initializePeer(roomId) {
    console.log("🚀 Initializing peer connection for room:", roomId);

    // Clean up any existing connection
    this.cleanup();

    // Set up new connection
    this.roomId = roomId;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    await this.initializeConnection();
  }

  async initializeConnection() {
    try {
      // Always use TURN servers for reliable connection
      await this.initializeWithTurn();
    } catch (error) {
      console.log("🔄 TURN connection failed, trying STUN fallback");
      try {
        await this.initializeWithStun();
      } catch (stunError) {
        console.error("❌ Both TURN and STUN initialization failed");
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
            ],
          },
          // Free TURN servers for better NAT traversal
          {
            urls: ["turn:openrelay.metered.ca:80"],
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: ["turn:openrelay.metered.ca:443"],
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      };

      await this.createPeerConnection(config);
      console.log("✅ Peer connection with STUN+TURN initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing STUN connection:", error);
      throw error;
    }
  }

  async initializeWithTurn() {
    try {
      console.log("🔄 Fetching TURN credentials...");

      const response = await fetch(import.meta.env.VITE_CRED, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch TURN credentials: ${response.status} ${response.statusText}`
        );
      }

      const credentials = await response.json();

      // Validate credentials format
      if (
        !credentials?.urls?.length ||
        !credentials.username ||
        !credentials.credential
      ) {
        throw new Error("Invalid TURN credentials format");
      }

      const config = {
        iceServers: [
          {
            urls: credentials.urls,
            username: credentials.username,
            credential: credentials.credential,
          },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      };

      await this.createPeerConnection(config);
      console.log("✅ TURN-based peer connection initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing TURN connection:", error);
      this.emit("error", {
        type: "turn",
        message: "Failed to initialize TURN connection",
        error,
      });
      throw error;
    }
  }

  async createPeerConnection(config) {
    if (!config?.iceServers?.length) {
      throw new Error("Invalid configuration: iceServers array is required");
    }

    console.log("🔧 Creating peer connection with config:", {
      iceServers: config.iceServers.map((server) => ({
        urls: server.urls,
        hasCredentials: !!(server.username && server.credential),
      })),
      ...config,
    });

    this.peer = new RTCPeerConnection(config);
    this.setupPeerEvents();
  }
  setRemotePeer(peerId) {
  this.remotePeerId = peerId;
  console.log("🎯 Set remote peer ID:", peerId);
}


  // Event Setup
  setupPeerEvents() {
    if (!this.peer) return;

    // ICE candidate handling
    this.peer.onicecandidate = ({ candidate }) => {
  if (candidate && this.socket) {
    console.log("📤 Sending ICE candidate to room:", this.roomId);
    
    // Send to the specific peer, not the room
    if (this.remotePeerId) {
      this.socket.emit("peer:ice-candidate", {
        candidate,
        to: this.remotePeerId, // Send to specific peer
        room: this.roomId
      });
    }
  }
};

    // Track handling with duplicate prevention
    this.peer.ontrack = (event) => {
      this.handleIncomingTrack(event);
    };

    // Connection state monitoring
    this.peer.oniceconnectionstatechange = () => {
      const iceState = this.peer?.iceConnectionState;
      console.log("🔵 ICE connection state:", iceState);

      switch (iceState) {
        case "connected":
        case "completed":
          console.log("✅ ICE CONNECTED - Media should flow now");
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit("iceConnected");
          break;
        case "checking":
          console.log("🔄 ICE checking candidates...");
          break;
        case "failed":
        case "disconnected":
          console.log("❌ ICE connection failed/disconnected");
          this.handleConnectionFailure();
          break;
        case "new":
          console.log("🆕 ICE connection in new state");
          break;
        default:
          console.log("🔵 ICE state:", iceState);
      }
    };

    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      console.log("🟡 Overall connection state:", state);

      if (state === "connected") {
        console.log("✅ Peer connection fully established");
      } else if (["failed", "disconnected"].includes(state)) {
        console.log("❌ Peer connection failed/disconnected");
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
      console.warn("⚠️ Received track without stream");
      return;
    }

    const streamId = stream.id;
    const trackKind = event.track.kind;

    console.log(`📺 Received ${trackKind} track for stream ${streamId}`);

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
        console.log(
          `✅ Emitting remote stream ${streamId} (audio: ${trackingInfo.hasAudio}, video: ${trackingInfo.hasVideo})`
        );
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
      console.log("🎵 Adding tracks to peer connection");

      // Remove existing senders
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
      console.log(`📎 Adding ${tracks.length} tracks to peer connection`);

      tracks.forEach((track) => {
        console.log(`➕ Adding ${track.kind} track`);
        try {
          const sender = this.peer.addTrack(track, stream);
          this.senders.set(track.kind, sender);
        } catch (e) {
          console.error(`❌ Error adding ${track.kind} track:`, e);
        }
      });

      console.log("✅ All tracks added successfully");
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
      console.log("🔄 Already attempting reconnection");
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached");
      this.emit("error", {
        type: "reconnect",
        message: "Max reconnection attempts reached",
      });
      this.cleanup();
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `🔄 Reconnection attempt ${this.reconnectAttempts} in ${delay}ms`
    );

    setTimeout(async () => {
      try {
        await this.initializeConnection();
        console.log("✅ Reconnection successful");
        this.isReconnecting = false;
      } catch (error) {
        console.error("❌ Reconnection attempt failed:", error);
        this.isReconnecting = false;
        await this.handleConnectionFailure();
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
    console.log("🧹 Cleaning up peer connection");

    // Clear stream tracking
    for (const trackingInfo of this._streamTracking.values()) {
      if (trackingInfo.timeoutId) {
        clearTimeout(trackingInfo.timeoutId);
      }
    }
    this._streamTracking.clear();

    // Clean up peer connection
    if (this.peer) {
      // Remove event handlers
      this.peer.ontrack = null;
      this.peer.onicecandidate = null;
      this.peer.oniceconnectionstatechange = null;
      this.peer.onconnectionstatechange = null;
      this.peer.onsignalingstatechange = null;
      this.remotePeerId = null;

      // Close connection
      this.peer.close();
      this.peer = null;
    }

    // Clear other properties
    this.senders.clear();
    this.pendingCandidates.length = 0;
    this.roomId = null;
    this.isReconnecting = false;
    this.isSettingRemoteDescription = false;
    this.reconnectAttempts = 0;
  }

  // Getters for debugging
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

// Export singleton instance
export default new PeerService();
