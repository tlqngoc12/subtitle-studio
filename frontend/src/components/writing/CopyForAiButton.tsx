import { Copy } from 'lucide-react';
import { toast } from 'sonner';

/** Copies the text `getText` builds (the writing rules for an AI's instructions) and says how long it was. */
export function CopyForAiButton({ getText }: { getText: () => Promise<string> }) {
  async function copy() {
    try {
      const text = await getText();
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${text.length} characters`);
    } catch {
      toast.error('Could not copy');
    }
  }
  return (
    <button type="button" className="button" onClick={() => void copy()}>
      <Copy className="icon" aria-hidden="true" />
      Copy for AI
    </button>
  );
}
