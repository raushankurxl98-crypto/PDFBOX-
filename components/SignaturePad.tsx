import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

interface SignaturePadProps {
  width?: number;
  height?: number;
}

export interface SignaturePadRef {
  clear: () => void;
  toDataURL: () => string;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ width = 400, height = 200 }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Adjust for device pixel ratio for sharper lines
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = '#374151'; // gray-700
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        setContext(ctx);
      }
    }
  }, []);

  const getCoordinates = (event: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (event instanceof MouseEvent) {
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    if (event.touches && event.touches.length > 0) {
      return { x: event.touches[0].clientX - rect.left, y: event.touches[0].clientY - rect.top };
    }
    return null;
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const coords = getCoordinates(event.nativeEvent);
    if (context && coords) {
      context.beginPath();
      context.moveTo(coords.x, coords.y);
      setIsDrawing(true);
    }
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (!isDrawing) return;
    const coords = getCoordinates(event.nativeEvent);
    if (context && coords) {
      context.lineTo(coords.x, coords.y);
      context.stroke();
    }
  };

  const stopDrawing = () => {
    if (context) {
      context.closePath();
    }
    setIsDrawing(false);
  };
  
  const clear = () => {
    if (context && canvasRef.current) {
      const canvas = canvasRef.current;
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  
  const toDataURL = (): string => {
    // Create a new canvas to trim whitespace
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) return '';

    const tempCtx = sourceCanvas.getContext('2d');
    if (!tempCtx) return '';

    const { width, height } = sourceCanvas;
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let top = height, bottom = -1, left = width, right = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
                left = Math.min(left, x);
                right = Math.max(right, x);
            }
        }
    }

    if (left > right) { // It's a blank canvas
      return '';
    }

    const trimWidth = right - left + 1;
    const trimHeight = bottom - top + 1;
    
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimWidth;
    trimmedCanvas.height = trimHeight;

    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (trimmedCtx) {
       trimmedCtx.drawImage(sourceCanvas, left, top, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);
    }

    return trimmedCanvas.toDataURL('image/png');
  };
  
  useImperativeHandle(ref, () => ({
    clear,
    toDataURL,
  }));

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
      className="border border-gray-300 rounded-lg bg-white cursor-crosshair w-full h-48"
      style={{ touchAction: 'none' }}
    />
  );
});

export default SignaturePad;
