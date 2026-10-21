import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/** <video>/<audio> bound to a MediaStream via srcObject. */
const MediaView = forwardRef(function MediaView({ stream, kind = 'video', muted = false, ...props }, ref) {
  const el = useRef(null);
  useImperativeHandle(ref, () => el.current, []);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (node.srcObject !== stream) node.srcObject = stream || null;
    if (stream) node.play?.().catch(() => {});
  }, [stream]);

  const Tag = kind;
  return <Tag ref={el} autoPlay playsInline muted={muted} {...props} />;
});

export default MediaView;
