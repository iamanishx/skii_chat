import EventEmitter from 'events';

class PeerService extends EventEmitter {
  constructor() {
    super();
    this.peer = null;
    this.roomId = null;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.senders = new Map();
    this.isReconnecting = false;
    this.pendingCandidates = [];

  }

  setSocket(socket) {
    this.socket = socket;
    this.setupSocketEvents();
  }

  setupSocketEvents() {
    if (!this.socket) return;

    this.socket.off('peer:ice-candidate').on('peer:ice-candidate', ({ candidate }) => {
      if (candidate && this.peer) this.addIceCandidate(candidate);
    });
  }

  async addIceCandidate(candidate) {
    try {
      if (this.peer?.remoteDescription && this.peer?.remoteDescription.type) {
        await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate successfully');
      } else {
        this.pendingCandidates.push(candidate);
        console.log('Stored ICE candidate for later');
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      this.emit('error', {
        type: 'ice-candidate',
        message: 'Error adding ICE candidate',
        error
      });
    }
  }

  async createOffer() {
    if (!this.peer) throw new Error('No peer connection available');
    try {
      const offer = await this.peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true // Add this to help with connection issues
      });
      await this.peer.setLocalDescription(offer);
      return offer;
    } catch (error) {
      this.emit('error', { type: 'offer', message: 'Error creating offer', error });
      await this.handleConnectionFailure();
    }
  }

  async createAnswer(offer) {
    if (!this.peer) throw new Error('No peer connection available');
    try {
      await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      return answer;
    } catch (error) {
      this.emit('error', { type: 'answer', message: 'Error creating answer', error });
      await this.handleConnectionFailure();
    }
  }


  async setRemoteDescription(answer) {
    if (!this.peer) return;

    // Prevent concurrent setRemoteDescription calls
    if (this.isSettingRemoteDescription) {
      console.log('Already setting remote description, skipping');
      return;
    }

    try {
      this.isSettingRemoteDescription = true;
      const currentState = this.peer.signalingState;
      console.log('Current signaling state:', currentState);

      // Only proceed if we're in a valid state
      if (['stable', 'have-local-offer'].includes(currentState)) {
        // Remove any extra createOffer calls here:
        // if (currentState === 'stable') {
        //   ...
        // }

        await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Remote description set successfully');

        // Apply any stored ICE candidates
        while (this.pendingCandidates.length) {
          const candidate = this.pendingCandidates.shift();
          await this.addIceCandidate(candidate);
        }
      } else {
        console.warn(`Invalid signaling state: ${currentState}`);
        throw new Error(`Invalid signaling state: ${currentState}`);
      }
    } catch (error) {
      console.error('Error setting remote description:', error);
      this.emit('error', {
        type: 'remote-description',
        message: 'Connection failed. Please try again.',
        error
      });
      await this.handleConnectionFailure();
    } finally {
      this.isSettingRemoteDescription = false;
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
      console.log('STUN connection failed, falling back to TURN');
      await this.initializeWithTurn();
    }
  }

  async initializeWithStun() {
  try {
    const config = {
      iceServers: [
        {
          urls: [
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302'
          ]
        },
        // Add free TURN servers for NAT traversal
        {
          urls: ['turn:openrelay.metered.ca:80'],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: ['turn:openrelay.metered.ca:443'],
          username: 'openrelayproject', 
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };
    await this.createPeerConnection(config);
    console.log('Peer connection with TURN initialized successfully.');
  } catch (error) {
    console.error('Error initializing connection:', error);
    throw error;
  }
}

  async initializeWithTurn() {
    try {
      const response = await fetch(import.meta.env.VITE_CRED, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch TURN credentials: ${response.status} ${response.statusText}\n${errorText}`);
      }

      let credentials;
      try {
        credentials = await response.json();
      } catch (e) {
        throw new Error(`Invalid JSON response from TURN server: ${await response.text()}`);
      }

      // Validate Cloudflare credentials format
      if (!credentials?.urls?.length || !credentials.username || !credentials.credential) {
        throw new Error('Invalid Cloudflare TURN credentials format');
      }

      // Create config with Cloudflare credentials
      const config = {
        iceServers: [
          // Include Cloudflare's combined STUN/TURN configuration
          {
            urls: credentials.urls,
            username: credentials.username,
            credential: credentials.credential
          }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      };

      await this.createPeerConnection(config);
      console.log('TURN-based peer connection initialized successfully with Cloudflare.');
    } catch (error) {
      console.error('Error initializing Cloudflare TURN connection:', error);
      this.emit('error', {
        type: 'turn',
        message: 'Failed to initialize Cloudflare TURN connection',
        error,
      });
      throw error;
    }
  }

  async createPeerConnection(config) {
    if (!config?.iceServers?.length) {
      throw new Error('Invalid configuration: iceServers array is required');
    }

    // Log the configuration for debugging
    console.log('Creating peer connection with config:', JSON.stringify(config, null, 2));

    this.peer = new RTCPeerConnection(config);
    this.setupPeerEvents();
  }


  setupPeerEvents() {
    if (!this.peer) return;

    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate && this.roomId) {
        console.log('Sending ICE candidate');
        this.socket?.emit('peer:ice-candidate', {
          candidate,
          to: this.roomId
        });
      }
    };

    this.peer.ontrack = (event) => {
  const stream = event.streams[0];
  if (!stream) return;
  
  const streamId = stream.id;
  
  // Initialize stream tracking
  if (!this._streamTracking) {
    this._streamTracking = new Map();
  }
  
  // Get or create tracking info for this stream
  let trackingInfo = this._streamTracking.get(streamId);
  if (!trackingInfo) {
    trackingInfo = {
      hasAudio: false,
      hasVideo: false,
      emitted: false,
      timeoutId: null
    };
    this._streamTracking.set(streamId, trackingInfo);
  }
  
  // Update tracking based on track type
  if (event.track.kind === 'audio') {
    trackingInfo.hasAudio = true;
  } else if (event.track.kind === 'video') {
    trackingInfo.hasVideo = true;
  }
  
  console.log(`Received ${event.track.kind} track for stream ${streamId}`);
  
  // Clear existing timeout
  if (trackingInfo.timeoutId) {
    clearTimeout(trackingInfo.timeoutId);
  }
  
  // Only emit once we have both tracks and haven't emitted yet
  trackingInfo.timeoutId = setTimeout(() => {
    if (!trackingInfo.emitted && trackingInfo.hasAudio && trackingInfo.hasVideo) {
      console.log(`Emitting complete remote stream with ID: ${streamId}`);
      trackingInfo.emitted = true;
      this.emit('remoteStream', { stream });
    }
  }, 500); // Wait longer to ensure both tracks are ready
};

   this.peer.oniceconnectionstatechange = () => {
  const iceState = this.peer?.iceConnectionState;
  console.log('🔵 ICE connection state changed to:', iceState);
  
  if (iceState === 'connected' || iceState === 'completed') {
    console.log('✅ ICE CONNECTED - Media should flow now');
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.emit('iceConnected'); // Add this event
  } else if (iceState === 'checking') {
    console.log('🔄 ICE checking candidates...');
  } else if (iceState === 'failed' || iceState === 'disconnected') {
    console.log('❌ ICE connection failed/disconnected');
    this.handleConnectionFailure();
  }
};

 this.peer.onconnectionstatechange = () => {
  const state = this.peer?.connectionState;
  console.log('🟡 Overall connection state:', state);
};
  }


  async handleConnectionFailure() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', { type: 'reconnect', message: 'Max reconnection attempts reached' });
      this.cleanup();
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    console.log(`Reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.initializeWithTurn();
        if (this.roomId) await this.createOffer();
        this.isReconnecting = false;
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
        this.isReconnecting = false;
        this.handleConnectionFailure();
      }
    }, delay);
  }

  async addTracks(stream) {
    if (!this.peer || !stream) {
      console.error('No peer or stream available');
      return;
    }

    try {
      // Remove existing tracks
      this.senders.forEach(sender => {
        try {
          this.peer.removeTrack(sender);
        } catch (e) {
          console.warn('Error removing track:', e);
        }
      });
      this.senders.clear();

      // Add new tracks
      const tracks = stream.getTracks();
      console.log(`Adding ${tracks} tracks to peer connection`);

      tracks.forEach((track) => {
        console.log('Adding track:', track.kind);
        try {
          const sender = this.peer.addTrack(track, stream);
          this.senders.set(track.kind, sender);
        } catch (e) {
          console.error('Error adding track:', e);
        }
      });
    } catch (error) {
      console.error('Error managing tracks:', error);
      this.emit('error', {
        type: 'add-tracks',
        message: 'Error adding tracks',
        error
      });
    }
  }


  async switchMediaSource(newStream) {
    if (!this.peer) {
      console.error('No peer connection available');
      return;
    }

    this.addTracks(newStream);
    this.emit('media-source-switched', { newStream });
  }

  async waitForStableState() {
    if (!this.peer || this.peer.signalingState === 'stable') return;

    return new Promise((resolve) => {
      const checkState = () => {
        if (!this.peer || this.peer.signalingState === 'stable') {
          resolve();
        } else {
          setTimeout(checkState, 100);
        }
      };
      checkState();
    });
  }


  cleanup() {
    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onicecandidate = null;
      this.peer.onconnectionstatechange = null;
      this.peer.close();
      this.peer = null;
    }
    this.senders.clear();
    this.roomId = null;
  }
}

export default new PeerService();
