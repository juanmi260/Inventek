import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

/**
 * Renders an <img> from a Blob, managing the object URL lifecycle.
 */
export function BlobImage({
  blob,
  alt,
  className,
}: {
  blob: Blob | undefined | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) return null;
  return <img src={url} alt={alt} className={cn(className)} />;
}
