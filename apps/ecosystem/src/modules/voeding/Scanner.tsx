import { useEffect, useRef, useState } from 'react';
import { Button } from '@ecosystem/ui';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Ingebouwde barcodescanner van de browser (o.a. Chrome op Android). Geen extra bibliotheek. */
export function scannerAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Scant via de camera tot er een barcode is gevonden. Beelden blijven in de browser en worden niet opgeslagen. */
export function Scanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector;
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const [found] = await detector.detect(video.current);
            if (found && /^\d{8,14}$/.test(found.rawValue)) {
              onDetected(found.rawValue);
              return;
            }
          } catch {
            // Volgende frame opnieuw proberen.
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      } catch {
        setError('De camera kon niet worden geopend. Geef toestemming of typ de barcode in.');
      }
    }
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);

  return (
    <div className="scanner">
      {error ? <p className="item-subtitle" role="alert">{error}</p> : <video ref={video} className="scanner-video" muted playsInline aria-label="Camerabeeld voor het scannen van een barcode" />}
      <Button type="button" variant="secondary" onClick={onClose}>Stoppen met scannen</Button>
    </div>
  );
}
