import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { getWritingRules, saveWritingRules } from '../../api/writingRules';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { effectiveRules, exportForAi, parseGlobalRules } from '../../lib/writingRules';
import { WRITING_RULES_SEED } from '../../lib/writingRulesSeed';
import { Alert } from '../ui/Alert';
import { Field } from '../ui/Field';
import { FormActions } from '../ui/FormActions';
import { LoadingText } from '../ui/LoadingText';
import { CopyForAiButton } from '../writing/CopyForAiButton';
import './WritingRulesForm.css';

const HELP =
  'Sections: ## Nguyên tắc viết (prose for the AI, never checked), ## Cụm cấm and ## Chi tiết cấm (one phrase per line, like - "cúi đầu"). ' +
  'Check marks these phrases in original stories; Copy for AI exports them.';

/** Settings › Writing rules: the global rules file as plain Markdown, plus "Copy for AI". */
export function WritingRulesForm() {
  /** The text on disk; '' also stands for "no file yet", where the box starts with the seed. */
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [loadError, setLoadError] = useState<ErrorMessage | null>(null);
  const [saveError, setSaveError] = useState<ErrorMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    alive.current = true;
    getWritingRules()
      .then((t) => {
        if (!alive.current) return;
        setSaved(t ?? '');
        setText(t ?? WRITING_RULES_SEED);
      })
      .catch((e) => alive.current && setLoadError(errorMessage(e)));
    return () => {
      alive.current = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaveError(null);
    const value = textRef.current;
    try {
      await saveWritingRules(value);
      if (!alive.current) return;
      setSaved(value);
      toast.success('Writing rules saved');
    } catch (e) {
      if (alive.current) setSaveError(errorMessage(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  // Ctrl+S / ⌘S saves instead of opening the browser's "save page" dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      void saveRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) return <Alert title={loadError.title} hint={loadError.hint} />;
  if (saved === null) return <LoadingText>Loading the writing rules…</LoadingText>;

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    void save();
  }

  return (
    <form className="writing-rules-form" onSubmit={submit} noValidate>
      {saveError && <Alert title={saveError.title} hint={saveError.hint} />}
      <Field label="Writing rules" hint={HELP}>
        {(f) => (
          <textarea
            id={f.id}
            className="writing-rules-form__text"
            value={text}
            spellCheck={false}
            rows={24}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={f.describedBy}
          />
        )}
      </Field>
      <FormActions sticky>
        <CopyForAiButton getText={async () => exportForAi(effectiveRules(parseGlobalRules(textRef.current), null), false)} />
        <button type="submit" className="button button--primary" disabled={text === saved || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </FormActions>
    </form>
  );
}
