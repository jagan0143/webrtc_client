import { useEffect, useRef, useState } from 'react';
import { useCall } from '../context/CallContext';
import { formatDuration } from '../utils/format';
import { countDevices } from '../webrtc/peer';
import Avatar from './Avatar';
import {
  FlipIcon,
  MicIcon,
  MicOffIcon,
  PhoneEndIcon,
  PhoneIcon,
  SpeakerIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons';
import MediaView from './MediaView';

const SINK_SUPPORTED = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function useElapsed(since) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since ? Math.max(0, (now - since) / 1000) : 0;
}

function RoundButton({ label, onClick, active = false, variant = '', disabled = false, children }) {
  return (
    <div className="round-btn-wrap">
      <button
        type="button"
        className={`round-btn ${variant} ${active ? 'active' : ''}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={variant ? undefined : active}
      >
        {children}
      </button>
      <span className="round-btn-label">{label}</span>
    </div>
  );
}

function IncomingCall() {
  const { call, acceptCall, hangup } = useCall();
  const isVideo = call.media === 'video';
  return (
    <div className="call-overlay incoming" role="dialog" aria-label={`Incoming call from ${call.peer?.name}`}>
      <div className="call-top">
        <p className="call-kind">{isVideo ? 'CallMe video call' : 'CallMe voice call'}</p>
        <div className="pulse">
          <Avatar user={call.peer} size={112} />
        </div>
        <h2 className="call-name">{call.peer?.name}</h2>
        <p className="call-status">{call.message}</p>
      </div>
      <div className="incoming-actions">
        <RoundButton label="Decline" variant="danger big" onClick={hangup}>
          <PhoneEndIcon size={30} />
        </RoundButton>
        <RoundButton label="Accept" variant="success big shake" onClick={acceptCall}>
          {isVideo ? <VideoIcon size={30} /> : <PhoneIcon size={30} />}
        </RoundButton>
      </div>
    </div>
  );
}

function ActiveCall() {
  const {
    call,
    localStream,
    remoteStream,
    micMuted,
    cameraOn,
    facingMode,
    notice,
    hangup,
    toggleMute,
    toggleCamera,
    flipCamera,
  } = useCall();
  const audioRef = useRef(null);
  const elapsed = useElapsed(call.connectedAt);
  const [cameraCount, setCameraCount] = useState(0);
  const [outputs, setOutputs] = useState([]);
  const [outputIdx, setOutputIdx] = useState(0);
  const [toast, setToast] = useState('');

  const ended = call.status === 'ended';
  const inCall = call.status === 'in-call';
  const showRemoteVideo = inCall && call.remoteVideo && remoteStream;

  useEffect(() => {
    if (cameraOn) countDevices('videoinput').then(setCameraCount);
  }, [cameraOn]);

  // Audio output switching (desktop Chrome/Edge; most mobile browsers route audio themselves).
  useEffect(() => {
    if (!SINK_SUPPORTED || !inCall) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((ds) => setOutputs(ds.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications')))
      .catch(() => {});
  }, [inCall]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const cycleOutput = async () => {
    if (outputs.length < 2 || !audioRef.current) return;
    const next = (outputIdx + 1) % outputs.length;
    try {
      await audioRef.current.setSinkId(outputs[next].deviceId);
      setOutputIdx(next);
      setToast(`Audio: ${outputs[next].label || `Output ${next + 1}`}`);
    } catch {
      setToast('Could not switch audio output');
    }
  };

  const status = ended ? call.message : call.message || formatDuration(elapsed);

  return (
    <div className={`call-overlay active ${showRemoteVideo ? 'has-video' : ''}`} role="dialog" aria-label="Call">
      <MediaView kind="audio" ref={audioRef} stream={remoteStream} className="hidden-media" />
      {showRemoteVideo && <MediaView stream={remoteStream} muted className="remote-video" />}

      <div className="call-top">
        <p className="call-kind">{call.media === 'video' || cameraOn || call.remoteVideo ? 'Video call' : 'Voice call'}</p>
        {!showRemoteVideo && <Avatar user={call.peer} size={112} className={call.status === 'outgoing' ? 'pulse-soft' : ''} />}
        <h2 className="call-name">{call.peer?.name}</h2>
        <p className={`call-status ${ended ? 'ended' : ''}`} aria-live="polite">
          {status}
        </p>
      </div>

      {cameraOn && localStream && !ended && (
        <MediaView stream={localStream} muted className={`local-video ${facingMode === 'user' ? 'mirror' : ''}`} />
      )}

      {(notice || toast) && <div className="call-toast">{notice || toast}</div>}

      {ended ? (
        <div className="call-controls">
          <RoundButton label="Close" variant="neutral" onClick={hangup}>
            <PhoneEndIcon size={26} />
          </RoundButton>
        </div>
      ) : (
        <div className="call-controls">
          <RoundButton label={micMuted ? 'Unmute' : 'Mute'} active={micMuted} onClick={toggleMute}>
            {micMuted ? <MicOffIcon /> : <MicIcon />}
          </RoundButton>
          <RoundButton label={cameraOn ? 'Camera off' : 'Camera'} active={cameraOn} onClick={toggleCamera}>
            {cameraOn ? <VideoIcon /> : <VideoOffIcon />}
          </RoundButton>
          {cameraOn && cameraCount > 1 && (
            <RoundButton label="Flip" onClick={flipCamera}>
              <FlipIcon />
            </RoundButton>
          )}
          {outputs.length > 1 && (
            <RoundButton label="Speaker" active={outputIdx > 0} onClick={cycleOutput}>
              <SpeakerIcon />
            </RoundButton>
          )}
          <RoundButton label="End" variant="danger" onClick={hangup}>
            <PhoneEndIcon size={26} />
          </RoundButton>
        </div>
      )}
    </div>
  );
}

export default function CallOverlay() {
  const { call } = useCall();
  if (call.status === 'idle') return null;
  return call.status === 'incoming' ? <IncomingCall /> : <ActiveCall />;
}
