import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../api/http';
import { closeNotifications } from '../push/push';
import {
  createPeer,
  DEFAULT_ICE_SERVERS,
  describe,
  getCameraTrack,
  getLocalMedia,
  mediaErrorMessage,
} from '../webrtc/peer';
import { startRingback, startRingtone, unlockAudio } from '../webrtc/tones';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

/*
 * Call state machine:
 *   idle -> outgoing (ringing them) | incoming (ringing us) -> connecting -> in-call -> ended -> idle
 *
 * Signaling: only the caller creates offers. Both sides always negotiate one audio and
 * one video transceiver, so turning the camera on/off later is just replaceTrack()
 * with no renegotiation.
 *
 * Every function below reads live values from refs, so the socket listeners
 * registered once per socket never see stale state.
 *
 * Phones suspend web apps in the background, so a call can briefly lose its socket.
 * The server keeps the call for a grace period; on reconnect we send call:rejoin and
 * the caller restarts ICE. Calls can also be opened from a push notification
 * (/?call=<id>&action=answer|open, or a message from the service worker).
 */

const CallContext = createContext(null);

const ENDED_SCREEN_MS = 2000;
const CONNECT_TIMEOUT_MS = 30_000;
// Slightly longer than the server's CALL_RECONNECT_GRACE_MS so the server decides first.
const RECONNECT_GRACE_MS = 25_000;

const IDLE = {
  status: 'idle',
  callId: null,
  peer: null,
  media: 'audio',
  direction: null,
  message: '',
  connectedAt: null,
  remoteVideo: false,
};

const isFree = (status) => status === 'idle' || status === 'ended';
const isLive = (status) => status === 'connecting' || status === 'in-call';

/** Call opened from a notification tap, read before the router rewrites the URL. */
function readOpenParams() {
  const params = new URLSearchParams(window.location.search);
  const callId = params.get('call');
  return callId ? { callId, action: params.get('action') === 'answer' ? 'answer' : 'open' } : null;
}
const stopTracks = (stream) => stream?.getTracks().forEach((t) => t.stop());

export function CallProvider({ children }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [openParams] = useState(readOpenParams);

  const [call, setCallState] = useState(IDLE);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [notice, setNotice] = useState('');
  const [missedCount, setMissedCount] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  const callRef = useRef(IDLE);
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const attemptRef = useRef(0);
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const videoSenderRef = useRef(null);
  const pendingIceRef = useRef([]);
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  const facingRef = useRef('user');
  const cameraBusyRef = useRef(false);
  const iceRestartedRef = useRef(false);
  const pendingOpenRef = useRef(null); // { callId, action } waiting for the server to re-send the call
  const stopToneRef = useRef(null);
  const timersRef = useRef({});

  // ---------- small helpers ----------

  const setCall = (patch) => {
    callRef.current = { ...callRef.current, ...patch };
    setCallState(callRef.current);
  };

  const isCurrent = (callId) => Boolean(callId) && callRef.current.callId === callId;

  const emit = (event, payload) => socketRef.current?.emit(event, payload);

  const emitAck = (event, payload) =>
    new Promise((resolve) => {
      const s = socketRef.current;
      if (!s?.connected) return resolve({ error: 'You are offline. Check your connection.' });
      s.timeout(10_000).emit(event, payload, (err, res) =>
        resolve(err ? { error: 'The server did not respond. Please try again.' } : res || {})
      );
    });

  const stopTone = () => {
    stopToneRef.current?.();
    stopToneRef.current = null;
  };

  const setTimer = (name, fn, ms) => {
    clearTimeout(timersRef.current[name]);
    timersRef.current[name] = fn ? setTimeout(fn, ms) : null;
  };

  const showNotice = (text) => {
    setNotice(text);
    setTimer('notice', () => setNotice(''), 3500);
  };

  const publishLocal = () =>
    setLocalStream(localRef.current ? new MediaStream(localRef.current.getTracks()) : null);

  const hasLocalVideo = () => Boolean(localRef.current?.getVideoTracks().length);

  const teardown = () => {
    stopTone();
    setTimer('connect', null);
    setTimer('rejoin', null);
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    pcRef.current = null;
    stopTracks(localRef.current);
    localRef.current = null;
    remoteRef.current = null;
    videoSenderRef.current = null;
    pendingIceRef.current = [];
    iceRestartedRef.current = false;
    facingRef.current = 'user';
    setLocalStream(null);
    setRemoteStream(null);
    setMicMuted(false);
    setCameraOn(false);
    setFacingMode('user');
    document.title = 'CallMe';
  };

  /** Tear everything down and show the "ended" screen briefly. */
  const finish = (message) => {
    teardown();
    if (callRef.current.status === 'idle') return;
    setCall({ status: 'ended', message });
    setHistoryVersion((v) => v + 1);
    setTimer('ended', () => callRef.current.status === 'ended' && setCall(IDLE), ENDED_SCREEN_MS);
  };

  const begin = (fields) => {
    setTimer('ended', null);
    attemptRef.current += 1;
    setCall({ ...IDLE, ...fields });
    return attemptRef.current;
  };

  const endCall = (message, reason) => {
    const { callId } = callRef.current;
    if (callId) emit('call:end', { callId, reason });
    finish(message);
  };

  // ---------- peer connection ----------

  const sendOffer = async (options) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setLocalDescription(await pc.createOffer(options));
    emit('webrtc:offer', { callId: callRef.current.callId, sdp: describe(pc.localDescription) });
  };

  /** Caller only: renegotiate ICE after a network change or the other side reconnecting. */
  const restartIce = async () => {
    const pc = pcRef.current;
    if (!pc || callRef.current.direction !== 'outgoing') return;
    try {
      if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
      await sendOffer({ iceRestart: true });
    } catch (err) {
      console.warn('ICE restart failed', err);
    }
  };

  const flushIce = async () => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) await pcRef.current?.addIceCandidate(candidate).catch(() => {});
  };

  const onConnectionState = (pc) => {
    if (pc !== pcRef.current) return;
    const c = callRef.current;
    switch (pc.connectionState) {
      case 'connected':
        setTimer('connect', null);
        if (c.status !== 'in-call') {
          setCall({ status: 'in-call', message: '', connectedAt: Date.now() });
          // Sync camera state; it may have changed while the phone was ringing.
          emit('call:media-toggle', { callId: c.callId, video: hasLocalVideo() });
        } else {
          setCall({ message: '' });
        }
        break;
      case 'disconnected':
        if (c.status === 'in-call') setCall({ message: 'Reconnecting…' });
        setTimer('connect', () => endCall('Connection lost', 'failed'), RECONNECT_GRACE_MS);
        break;
      case 'failed':
        if (c.direction === 'outgoing' && !iceRestartedRef.current) {
          iceRestartedRef.current = true;
          setCall({ message: 'Reconnecting…' });
          void restartIce();
          setTimer('connect', () => endCall('Connection lost', 'failed'), RECONNECT_GRACE_MS);
        } else if (c.direction === 'outgoing') {
          endCall('Connection lost', 'failed');
        } else {
          // Callee waits for the caller's ICE restart.
          setTimer('connect', () => endCall('Connection lost', 'failed'), RECONNECT_GRACE_MS);
        }
        break;
      default:
    }
  };

  const setupPeer = () => {
    const pc = createPeer(iceServersRef.current);
    pcRef.current = pc;
    remoteRef.current = new MediaStream();
    pc.onicecandidate = (e) => {
      if (e.candidate) emit('webrtc:ice', { callId: callRef.current.callId, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const rs = remoteRef.current;
      if (!rs) return;
      if (!rs.getTracks().includes(e.track)) rs.addTrack(e.track);
      setRemoteStream(new MediaStream(rs.getTracks()));
    };
    pc.onconnectionstatechange = () => onConnectionState(pc);
    setTimer('connect', () => endCall('Could not connect the call', 'failed'), CONNECT_TIMEOUT_MS);
    return pc;
  };

  // ---------- actions (used by the UI) ----------

  const startCall = async (peer, media = 'audio') => {
    if (!peer?._id || !isFree(callRef.current.status)) return;
    unlockAudio();
    const attempt = begin({ status: 'outgoing', peer, media, direction: 'outgoing', message: 'Calling…' });
    const stillThisAttempt = () => attemptRef.current === attempt && callRef.current.status === 'outgoing';

    if (!socketRef.current?.connected) return finish('You are offline. Check your connection.');

    let stream;
    try {
      stream = await getLocalMedia({ video: media === 'video' });
    } catch (err) {
      return stillThisAttempt() && finish(mediaErrorMessage(err));
    }
    if (!stillThisAttempt()) return stopTracks(stream);
    localRef.current = stream;
    publishLocal();
    setCameraOn(hasLocalVideo());

    const res = await emitAck('call:initiate', { calleeId: peer._id, media });
    if (!stillThisAttempt()) {
      // Hung up while waiting for the server.
      if (res.status === 'ringing') emit('call:cancel', { callId: res.callId });
      return undefined;
    }
    if (res.error) return finish(res.error);
    if (res.status === 'unavailable') return finish(`${peer.name} is offline. They'll see a missed call.`);
    if (res.status === 'busy') return finish(`${peer.name} is on another call`);

    setCall({ callId: res.callId, message: 'Ringing…' });
    stopToneRef.current = startRingback();
    return undefined;
  };

  const acceptCall = async () => {
    const c = callRef.current;
    if (c.status !== 'incoming') return;
    stopTone();
    document.title = 'CallMe';
    setCall({ status: 'connecting', message: 'Connecting…' });
    const stillConnecting = () => isCurrent(c.callId) && callRef.current.status === 'connecting';

    let stream;
    try {
      stream = await getLocalMedia({ video: c.media === 'video' });
    } catch (err) {
      if (!stillConnecting()) return;
      emit('call:reject', { callId: c.callId });
      finish(mediaErrorMessage(err));
      return;
    }
    if (!stillConnecting()) {
      stopTracks(stream);
      return;
    }
    localRef.current = stream;
    publishLocal();
    setCameraOn(hasLocalVideo());
    setupPeer();

    const res = await emitAck('call:accept', { callId: c.callId, video: hasLocalVideo() });
    if (res.error && stillConnecting()) finish(res.error);
  };

  const hangup = () => {
    const c = callRef.current;
    switch (c.status) {
      case 'outgoing':
        if (c.callId) emit('call:cancel', { callId: c.callId });
        finish('Call cancelled');
        break;
      case 'incoming':
        emit('call:reject', { callId: c.callId });
        finish('Call declined');
        break;
      case 'connecting':
      case 'in-call':
        endCall('Call ended');
        break;
      case 'ended':
        setTimer('ended', null);
        setCall(IDLE);
        break;
      default:
    }
  };

  const toggleMute = () => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicMuted(!track.enabled);
  };

  const notifyVideo = (video) => {
    const c = callRef.current;
    if (c.callId && (c.status === 'connecting' || c.status === 'in-call')) {
      emit('call:media-toggle', { callId: c.callId, video });
    }
  };

  const toggleCamera = async () => {
    const stream = localRef.current;
    if (!stream || cameraBusyRef.current) return;
    cameraBusyRef.current = true;
    try {
      const current = stream.getVideoTracks()[0];
      if (current) {
        current.stop();
        stream.removeTrack(current);
        await videoSenderRef.current?.replaceTrack(null).catch(() => {});
        setCameraOn(false);
        notifyVideo(false);
      } else {
        const track = await getCameraTrack(facingRef.current);
        if (localRef.current !== stream) return track.stop(); // call ended meanwhile
        stream.addTrack(track);
        await videoSenderRef.current?.replaceTrack(track);
        setCameraOn(true);
        notifyVideo(true);
      }
      publishLocal();
    } catch (err) {
      showNotice(mediaErrorMessage(err));
    } finally {
      cameraBusyRef.current = false;
    }
    return undefined;
  };

  const flipCamera = async () => {
    const stream = localRef.current;
    const current = stream?.getVideoTracks()[0];
    if (!current || cameraBusyRef.current) return;
    cameraBusyRef.current = true;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      current.stop(); // many phones can't open both cameras at once
      stream.removeTrack(current);
      let track;
      try {
        track = await getCameraTrack(next);
        facingRef.current = next;
      } catch {
        track = await getCameraTrack(facingRef.current);
        showNotice('Could not switch camera');
      }
      if (localRef.current !== stream) return track.stop();
      stream.addTrack(track);
      await videoSenderRef.current?.replaceTrack(track);
      setFacingMode(facingRef.current);
    } catch (err) {
      await videoSenderRef.current?.replaceTrack(null).catch(() => {});
      setCameraOn(false);
      notifyVideo(false);
      showNotice(mediaErrorMessage(err));
    } finally {
      cameraBusyRef.current = false;
      publishLocal();
    }
    return undefined;
  };

  const markMissedSeen = useCallback(async () => {
    try {
      await http.patch('/calls/missed/seen');
      setMissedCount(0);
    } catch {
      /* badge will refresh on next load */
    }
  }, []);

  // ---------- socket events ----------

  const onIncoming = ({ callId, from, media }) => {
    const { status } = callRef.current;
    if (isCurrent(callId) && !isFree(status)) return; // re-sent after a reconnect; already showing
    if (!isFree(status)) {
      emit('call:reject', { callId });
      return;
    }
    begin({
      status: 'incoming',
      callId,
      peer: from,
      media,
      direction: 'incoming',
      remoteVideo: media === 'video',
      message: media === 'video' ? 'Incoming video call' : 'Incoming voice call',
    });
    stopToneRef.current = startRingtone();
    document.title = `📞 ${from.name} is calling…`;
    // The in-app screen replaces any "is calling" notification.
    void closeNotifications((d) => d.callId === callId);

    const pending = pendingOpenRef.current;
    if (pending?.callId === callId) {
      pendingOpenRef.current = null;
      if (pending.action === 'answer') void acceptCall();
    }
  };

  /** A notification was tapped: show that call if it's still ringing, otherwise the missed list. */
  const checkPendingOpen = async () => {
    const pending = pendingOpenRef.current;
    if (!pending || !socketRef.current?.connected) return;
    const res = await emitAck('call:rejoin', { callId: pending.callId });
    if (res.error || pendingOpenRef.current !== pending) return;
    // 'ringing': the server re-sent call:incoming, which onIncoming picks up.
    if (res.state !== 'ringing') {
      pendingOpenRef.current = null;
      void navigate('/missed');
    }
  };

  const openFromNotification = (callId, action = 'open') => {
    if (!callId) return;
    const c = callRef.current;
    if (isCurrent(callId) && !isFree(c.status)) {
      if (c.status === 'incoming' && action === 'answer') void acceptCall();
      return;
    }
    pendingOpenRef.current = { callId, action };
    void checkPendingOpen(); // if not connected yet, onConnect does it
  };

  const onAccepted = async ({ callId, video }) => {
    if (!isCurrent(callId) || callRef.current.status !== 'outgoing') return;
    stopTone();
    setCall({ status: 'connecting', message: 'Connecting…', remoteVideo: Boolean(video) });
    try {
      const pc = setupPeer();
      const stream = localRef.current;
      pc.addTransceiver(stream.getAudioTracks()[0], { direction: 'sendrecv' });
      const videoTx = pc.addTransceiver(stream.getVideoTracks()[0] || 'video', { direction: 'sendrecv' });
      videoSenderRef.current = videoTx.sender;
      await sendOffer();
    } catch (err) {
      console.error('Failed to create offer', err);
      endCall('Could not start the call', 'failed');
    }
  };

  const onOffer = async ({ callId, sdp }) => {
    const pc = pcRef.current;
    if (!pc || !isCurrent(callId)) return;
    try {
      await pc.setRemoteDescription(sdp);
      if (!videoSenderRef.current) {
        // First offer: attach our tracks to the transceivers the offer created.
        const stream = localRef.current;
        for (const t of pc.getTransceivers()) {
          const kind = t.receiver.track.kind;
          const track = kind === 'audio' ? stream?.getAudioTracks()[0] : stream?.getVideoTracks()[0];
          await t.sender.replaceTrack(track || null);
          t.direction = 'sendrecv';
          if (kind === 'video') videoSenderRef.current = t.sender;
        }
      }
      await pc.setLocalDescription(await pc.createAnswer());
      emit('webrtc:answer', { callId, sdp: describe(pc.localDescription) });
      await flushIce();
    } catch (err) {
      console.error('Failed to handle offer', err);
      endCall('Could not connect the call', 'failed');
    }
  };

  const onAnswer = async ({ callId, sdp }) => {
    const pc = pcRef.current;
    if (!pc || !isCurrent(callId) || pc.signalingState !== 'have-local-offer') return;
    try {
      await pc.setRemoteDescription(sdp);
      await flushIce();
    } catch (err) {
      console.error('Failed to handle answer', err);
      endCall('Could not connect the call', 'failed');
    }
  };

  const onIce = ({ callId, candidate }) => {
    const pc = pcRef.current;
    if (!pc || !isCurrent(callId) || !candidate) return;
    if (pc.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
    else pendingIceRef.current.push(candidate);
  };

  const onRejected = ({ callId }) => {
    if (isCurrent(callId) && callRef.current.status === 'outgoing') {
      finish(`${callRef.current.peer?.name || 'They'} declined the call`);
    }
  };

  const onNoAnswer = ({ callId }) => {
    if (isCurrent(callId) && callRef.current.status === 'outgoing') finish('No answer');
  };

  const onMissed = ({ callId, from }) => {
    setMissedCount((n) => n + 1);
    setHistoryVersion((v) => v + 1);
    const { status } = callRef.current;
    if (isCurrent(callId) && (status === 'incoming' || status === 'connecting')) {
      finish(`Missed call from ${from?.name || 'unknown'}`);
    }
  };

  const onDismissed = ({ callId }) => {
    // Answered or declined on another device/tab.
    if (isCurrent(callId) && callRef.current.status === 'incoming') {
      teardown();
      setCall(IDLE);
      setHistoryVersion((v) => v + 1);
    }
  };

  const onEnded = ({ callId, status }) => {
    if (isCurrent(callId) && !isFree(callRef.current.status)) {
      finish(status === 'failed' ? 'Connection lost' : 'Call ended');
    }
  };

  const onMediaToggle = ({ callId, video }) => {
    if (isCurrent(callId)) setCall({ remoteVideo: Boolean(video) });
  };

  const onSocketDisconnect = () => {
    const { status } = callRef.current;
    // The server cancels a call we were dialling; an answered call gets a grace period.
    if (status === 'outgoing') finish('Connection lost');
    else if (isLive(status)) {
      setCall({ message: 'Reconnecting…' });
      setTimer('rejoin', () => endCall('Connection lost', 'failed'), RECONNECT_GRACE_MS);
    }
  };

  const onConnect = async () => {
    void closeNotifications((d) => d.type === 'incoming-call' && !isCurrent(d.callId));
    void checkPendingOpen();

    const c = callRef.current;
    if (!c.callId || isFree(c.status) || c.status === 'outgoing') return;
    const res = await emitAck('call:rejoin', { callId: c.callId });
    if (res.error || !isCurrent(c.callId) || isFree(callRef.current.status)) return;

    if (callRef.current.status === 'incoming') {
      if (res.state !== 'ringing') finish('Call ended');
      return;
    }
    if (res.state !== 'ongoing') {
      finish('Call ended');
      return;
    }
    setTimer('rejoin', null);
    // Media usually kept flowing while only the socket was down; then nothing else would clear the message.
    if (callRef.current.status === 'in-call' && pcRef.current?.connectionState === 'connected') {
      setCall({ message: '' });
    }
    void restartIce();
  };

  const onPeerReconnecting = ({ callId }) => {
    if (isCurrent(callId) && callRef.current.status === 'in-call') setCall({ message: 'Reconnecting…' });
  };

  const onPeerResumed = ({ callId }) => {
    if (!isCurrent(callId) || !isLive(callRef.current.status)) return;
    if (callRef.current.status === 'in-call' && pcRef.current?.connectionState === 'connected') {
      setCall({ message: '' });
    }
    void restartIce();
  };

  useEffect(() => {
    if (!socket) return undefined;
    const handlers = {
      'call:incoming': onIncoming,
      'call:accepted': onAccepted,
      'call:rejected': onRejected,
      'call:no-answer': onNoAnswer,
      'call:missed': onMissed,
      'call:dismissed': onDismissed,
      'call:ended': onEnded,
      'call:media-toggle': onMediaToggle,
      'webrtc:offer': onOffer,
      'webrtc:answer': onAnswer,
      'webrtc:ice': onIce,
      'call:peer-reconnecting': onPeerReconnecting,
      'call:peer-resumed': onPeerResumed,
      connect: onConnect,
      disconnect: onSocketDisconnect,
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      // Logged out or socket replaced: drop any call in progress.
      if (callRef.current.status !== 'idle') {
        teardown();
        setCall(IDLE);
      }
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a notification: via the URL on a cold start, or a service-worker message if already open.
  useEffect(() => {
    if (openParams) openFromNotification(openParams.callId, openParams.action);
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      const d = event.data || {};
      if (d.type === 'open-call') openFromNotification(d.callId, d.action);
      else if (d.type === 'navigate' && typeof d.url === 'string' && d.url.startsWith('/')) void navigate(d.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen on during a call (re-acquired when the app comes back to the foreground).
  const callIsLive = isLive(call.status);
  useEffect(() => {
    if (!callIsLive || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const acquire = async () => {
      if (lock || stopped || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => {
          lock = null;
        });
        if (stopped) await lock.release();
      } catch {
        /* denied (e.g. battery saver) */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [callIsLive]);

  // ICE servers (STUN/TURN) come from the server.
  useEffect(() => {
    if (!user?._id) return;
    http
      .get('/config/ice')
      .then(({ data }) => {
        if (data.iceServers?.length) iceServersRef.current = data.iceServers;
      })
      .catch(() => {});
  }, [user?._id]);

  // Missed-call badge: load on every (re)connect.
  useEffect(() => {
    if (!socket) {
      setMissedCount(0);
      return undefined;
    }
    const refresh = () =>
      http
        .get('/calls/missed/count')
        .then(({ data }) => setMissedCount(data.count))
        .catch(() => {});
    socket.on('connect', refresh);
    if (socket.connected) refresh();
    return () => socket.off('connect', refresh);
  }, [socket]);

  // Clear timers on unmount.
  useEffect(() => () => Object.values(timersRef.current).forEach(clearTimeout), []);

  const value = {
    call,
    localStream,
    remoteStream,
    micMuted,
    cameraOn,
    facingMode,
    notice,
    missedCount,
    historyVersion,
    canCall: isFree(call.status),
    startCall,
    acceptCall,
    hangup,
    toggleMute,
    toggleCamera,
    flipCamera,
    markMissedSeen,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export const useCall = () => useContext(CallContext);
