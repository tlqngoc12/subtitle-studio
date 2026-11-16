import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { stripImageMarkers } from '../../lib/chapterText';
import { toastCopied, toastCopyFailed } from '../../lib/toast';
import { IconButton } from '../ui/IconButton';

/**
 * A small neutral button for the corner of a text box: copies `text` as plain text (image marker lines removed) and
 * shows a check for 1.5 s. It sits in the box's top-right corner (the box must be `position: relative`). An empty
 * text copies an empty string.
 */
export function CopyTextButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(stripImageMarkers(text));
    } catch {
      toastCopyFailed();
      return;
    }
    toastCopied();
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  }

  return <IconButton size="s" className="copy-corner" label={label} icon={done ? Check : Copy} onClick={() => void copy()} />;
}
