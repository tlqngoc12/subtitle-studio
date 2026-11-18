import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../../api/client';
import { getNovelProfile, saveNovelProfile } from '../../api/novelProfile';
import { addCheckRule, type CheckRule } from '../../lib/checkRules';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
import { Field } from '../ui/Field';
import { FormActions } from '../ui/FormActions';
import { IconButton } from '../ui/IconButton';
import '../CreatePlaylistDialog.css';

/** The longest phrase that can be added as a rule. */
export const MAX_RULE_PHRASE = 60;

/** The selection as a phrase: trimmed and NFC. */
export function selectedPhrase(selection: string): string {
  return selection.trim().normalize('NFC');
}

/** Why `selection` cannot become a rule (a tooltip text), or null when it can. */
export function ruleSelectionProblem(selection: string, opts: { hasProfile: boolean; locked: boolean }): string | null {
  const phrase = selectedPhrase(selection);
  if (opts.locked) return 'Adding rules is off while the chapter is translating';
  if (!opts.hasProfile) return 'This novel has no profile';
  if (phrase === '') return 'Select the wrong phrase in the text first';
  if ([...phrase].length > MAX_RULE_PHRASE) return `Select at most ${MAX_RULE_PHRASE} characters`;
  if (/[\r\n]/.test(phrase) || /["“”]/.test(phrase)) return 'Select a phrase without a line break or a quote mark';
  return null;
}

/** Parses the Suggestions input: parts separated by `|`, trimmed, empty ones dropped. */
export function parseSuggestions(input: string): string[] {
  return input
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Adds a rule to the novel profile's `## Kiểm tra` section: reads the profile, inserts the line and saves with the sha
 * it was read with. When the profile changed in between (another tab), it reads again and retries once.
 */
async function saveRule(novelId: number, rule: CheckRule): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const details = await getNovelProfile(novelId);
    try {
      await saveNovelProfile(novelId, addCheckRule(details.text, rule), details.sha);
      return;
    } catch (e) {
      if (attempt === 0 && e instanceof ApiError && e.status === 409) continue;
      throw e;
    }
  }
}

/** "Add to check rules": Wrong phrase (prefilled), Suggestions (separated by `|`) and Reason. Mounted only while open. */
export function AddCheckRuleDialog({
  open,
  onOpenChange,
  novelId,
  selection,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: number;
  /** The text selected in the chapter; it prefills the wrong phrase. */
  selection: string;
  /** Called after the rule is saved, so the Check can read the rules again. */
  onAdded: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pldialog__overlay" />
        <Dialog.Content className="pldialog" aria-describedby={undefined}>
          <div className="pldialog__head">
            <Dialog.Title className="pldialog__title">Add to check rules</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <AddCheckRuleForm
            novelId={novelId}
            initial={selectedPhrase(selection)}
            onCancel={() => onOpenChange(false)}
            onAdded={() => {
              onAdded();
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddCheckRuleForm({
  novelId,
  initial,
  onCancel,
  onAdded,
}: {
  novelId: number;
  initial: string;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [wrong, setWrong] = useState(initial);
  const [suggestions, setSuggestions] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // This form lives in a portal; React still bubbles its submit to a form around the trigger.
    e.stopPropagation();
    const phrase = selectedPhrase(wrong);
    const parts = parseSuggestions(suggestions);
    const note = reason.trim();
    const bad = [phrase, ...parts].some((p) => /["“”\r\n]/.test(p)) || /[()\r\n]/.test(note);
    if (phrase === '') return;
    if (bad) {
      setError({ title: 'Phrases cannot contain quote marks, and the reason cannot contain brackets or line breaks.' });
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveRule(novelId, { wrong: phrase, suggestions: parts, reason: note === '' ? null : note });
      toast.success('Rule added');
      onAdded();
    } catch (err) {
      // The dialog stays open with what was typed.
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form className="pldialog__form" onSubmit={submit} aria-label="Add check rule" aria-busy={pending}>
      <Field label="Wrong phrase" required>
        {({ id }) => (
          <input id={id} type="text" autoComplete="off" autoFocus required value={wrong} onChange={(e) => setWrong(e.target.value)} />
        )}
      </Field>
      <Field label="Suggestions" hint="Separate several with | . Leave empty to only flag the phrase.">
        {({ id, describedBy }) => (
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={suggestions}
            aria-describedby={describedBy}
            onChange={(e) => setSuggestions(e.target.value)}
          />
        )}
      </Field>
      <Field label="Reason (optional)">
        {({ id }) => <input id={id} type="text" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      {error && <Alert title={error.title} hint={error.hint} />}
      <FormActions tight>
        <button className="button" type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button className="button button--primary" type="submit" disabled={pending}>
          <Plus className="icon" aria-hidden="true" />
          {pending ? 'Adding…' : 'Add rule'}
        </button>
      </FormActions>
    </form>
  );
}
