// ============================================================
//  voice.js — WebRTC voice chat manager
//  Gerencia conexões peer-to-peer de áudio dentro de "salas"
//  (rooms ou desk areas). Usa Socket.io para sinalização.
// ============================================================
(function (window) {
  'use strict';

  class VoiceManager {
    constructor(socket) {
      this.socket      = socket;
      this.localStream = null;
      this.peers       = new Map(); // peerId -> RTCPeerConnection
      this.currentRoom = null;
      this.muted       = false;
      this.onStatusChange = null; // callback(status: 'connected'|'disconnected'|'error')
      this.audioContext   = null;
      this.localAnalyser  = null;
      this.peerAnalysers  = new Map();

      this.iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

      this._listen();
    }

    _listen() {
      const s = this.socket;

      s.on('voice:room-peers', async ({ peers }) => {
        for (const pid of peers) await this._makePeer(pid, true);
      });

      s.on('voice:peer-left', ({ peerId }) => this._closePeer(peerId));

      s.on('voice:offer', async ({ from, offer }) => {
        const pc = await this._makePeer(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit('voice:answer', { to: from, answer });
      });

      s.on('voice:answer', async ({ from, answer }) => {
        const pc = this.peers.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      s.on('voice:ice-candidate', async ({ from, candidate }) => {
        const pc = this.peers.get(from);
        if (pc && candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
        }
      });
    }

    async joinRoom(roomId) {
      if (this.currentRoom === roomId) return;
      if (this.currentRoom) await this.leaveRoom();

      this.currentRoom = roomId;
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (this.muted) this.localStream.getAudioTracks().forEach(t => (t.enabled = false));

        this.audioContext  = new (window.AudioContext || window.webkitAudioContext)();
        const src          = this.audioContext.createMediaStreamSource(this.localStream);
        this.localAnalyser = this.audioContext.createAnalyser();
        this.localAnalyser.fftSize = 512;
        src.connect(this.localAnalyser);

        this.socket.emit('voice:join-room', { roomId });
        if (this.onStatusChange) this.onStatusChange('connected');
      } catch (e) {
        console.error('[Voice] Mic denied:', e);
        this.currentRoom = null;
        if (this.onStatusChange) this.onStatusChange('error');
      }
    }

    async leaveRoom() {
      if (!this.currentRoom) return;
      this.socket.emit('voice:leave-room', { roomId: this.currentRoom });
      this.peers.forEach((_, pid) => this._closePeer(pid));
      this.peers.clear();
      if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
      if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
      this.localAnalyser = null;
      this.peerAnalysers.clear();
      this.currentRoom = null;
      if (this.onStatusChange) this.onStatusChange('disconnected');
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.localStream) this.localStream.getAudioTracks().forEach(t => (t.enabled = !this.muted));
      return this.muted;
    }

    /** Returns true if local mic is picking up sound above threshold */
    isSpeaking(threshold) {
      if (!this.localAnalyser || this.muted) return false;
      return this._analyserLevel(this.localAnalyser) > (threshold || 25);
    }

    isPeerSpeaking(peerId, threshold) {
      const a = this.peerAnalysers.get(peerId);
      if (!a) return false;
      return this._analyserLevel(a) > (threshold || 25);
    }

    _analyserLevel(analyser) {
      const d = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(d);
      return d.reduce((a, b) => a + b, 0) / d.length;
    }

    async _makePeer(peerId, isInitiator) {
      if (this.peers.has(peerId)) return this.peers.get(peerId);
      const pc = new RTCPeerConnection(this.iceConfig);
      this.peers.set(peerId, pc);

      if (this.localStream) this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));

      pc.ontrack = (ev) => {
        const audio = new Audio();
        audio.srcObject = ev.streams[0];
        audio.play().catch(() => {});
        pc._audio = audio;
        if (this.audioContext) {
          const src = this.audioContext.createMediaStreamSource(ev.streams[0]);
          const an  = this.audioContext.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          this.peerAnalysers.set(peerId, an);
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) this.socket.emit('voice:ice-candidate', { to: peerId, candidate: ev.candidate });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') this._closePeer(peerId);
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.socket.emit('voice:offer', { to: peerId, offer });
      }
      return pc;
    }

    _closePeer(pid) {
      const pc = this.peers.get(pid);
      if (pc) { if (pc._audio) { pc._audio.srcObject = null; } pc.close(); this.peers.delete(pid); }
      this.peerAnalysers.delete(pid);
    }
  }

  window.VoiceManager = VoiceManager;
})(window);
