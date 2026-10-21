export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export const videoConstraints = (facingMode = 'user') => ({
  facingMode,
  width: { ideal: 640 },
  height: { ideal: 480 },
});

function assertMediaSupport() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Media devices unavailable');
    err.name = 'InsecureContext';
    throw err;
  }
}

/**
 * Gets the microphone (and camera if asked). If only the camera fails,
 * falls back to audio so the call can still go ahead.
 */
export async function getLocalMedia({ video = false, facingMode = 'user' } = {}) {
  assertMediaSupport();
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: video ? videoConstraints(facingMode) : false,
    });
  } catch (err) {
    if (!video || err.name === 'NotAllowedError' || err.name === 'SecurityError') throw err;
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
  }
}

export async function getCameraTrack(facingMode = 'user') {
  assertMediaSupport();
  const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(facingMode) });
  return stream.getVideoTracks()[0];
}

export function mediaErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone/camera access was blocked. Allow it in your browser settings and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone or camera was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your microphone or camera is being used by another app.';
    case 'InsecureContext':
      return 'Calls need a secure connection (HTTPS or localhost) to use the microphone.';
    default:
      return 'Could not access your microphone or camera.';
  }
}

export const createPeer = (iceServers) => new RTCPeerConnection({ iceServers });

export const describe = (desc) => ({ type: desc.type, sdp: desc.sdp });

export async function countDevices(kind) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === kind).length;
  } catch {
    return 0;
  }
}
