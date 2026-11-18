import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../../api/client';
import {
  getGeminiModels,
  getGeminiSettings,
  saveGeminiSettings,
  type GeminiSettingsDto,
  type GeminiValues,
} from '../../api/settings';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
import { Combobox } from '../ui/Combobox';
import { Field } from '../ui/Field';
import { FormActions } from '../ui/FormActions';
import { LoadingText } from '../ui/LoadingText';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';
import { ModelListEditor } from './ModelListEditor';
import './GeminiSettingsForm.css';

/** The form's own copy of the values: temperature stays text so a half-typed "0." is not rewritten. */
interface Draft {
  model: string;
  fallbackModels: string[];
  thinkingLevel: string;
  temperature: string;
  timeoutSeconds: number | null;
  overloadCooldownMinutes: number | null;
}

type FieldName = keyof Draft;

/** "" in the thinking level select means "the default", so a level equal to the default is shown as that. */
const toDraft = (v: GeminiValues, defaults: GeminiValues): Draft => ({
  ...v,
  thinkingLevel: v.thinkingLevel === defaults.thinkingLevel ? '' : v.thinkingLevel,
  temperature: String(v.temperature),
});

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Draft values that differ from the draft of `other`, by field. */
function differs(a: Draft, b: Draft, field: FieldName): boolean {
  if (field === 'fallbackModels') return !sameList(a.fallbackModels, b.fallbackModels);
  if (field === 'temperature') return Number(a.temperature) !== Number(b.temperature);
  return a[field] !== b[field];
}

const THINKING = ['minimal', 'low', 'medium', 'high'];

/** Settings › Gemini: the model, fallbacks, thinking level, temperature, timeout and overload rest. */
export function GeminiSettingsForm() {
  const [settings, setSettings] = useState<GeminiSettingsDto | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<ErrorMessage | null>(null);
  const [saveError, setSaveError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getGeminiSettings()
      .then((s) => {
        if (!alive.current) return;
        setSettings(s);
        setDraft(toDraft(s.effective, s.defaults));
      })
      .catch((e) => alive.current && setLoadError(errorMessage(e)));
    getGeminiModels().then((m) => alive.current && setModels(m));
    return () => {
      alive.current = false;
    };
  }, []);

  if (loadError) return <Alert title={loadError.title} hint={loadError.hint} />;
  if (!settings || !draft) return <LoadingText>Loading the settings…</LoadingText>;

  const saved = toDraft(settings.effective, settings.defaults);
  const defaults = toDraft(settings.defaults, settings.defaults);
  const dirty = (Object.keys(draft) as FieldName[]).some((f) => differs(draft, saved, f));

  function set<K extends FieldName>(field: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  /** The "Default: …" hint with a Reset button when the value is not the default. */
  function reset(field: FieldName, label: string) {
    if (!draft || !differs(draft, defaults, field)) return null;
    return (
      <button type="button" className="button button--ghost button--s" aria-label={`Reset ${label}`} onClick={() => set(field, defaults[field] as never)}>
        Reset
      </button>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!draft) return;
    const temperature = Number(draft.temperature);
    const local: Partial<Record<FieldName, string>> = {};
    if (draft.temperature.trim() === '' || Number.isNaN(temperature)) local.temperature = 'Enter a number from 0 to 2.';
    if (draft.timeoutSeconds === null) local.timeoutSeconds = 'Enter the number of seconds.';
    if (draft.overloadCooldownMinutes === null) local.overloadCooldownMinutes = 'Enter the number of minutes.';
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const next = await saveGeminiSettings({
        model: draft.model.trim(),
        fallbackModels: draft.fallbackModels,
        thinkingLevel: draft.thinkingLevel,
        temperature,
        timeoutSeconds: draft.timeoutSeconds as number,
        overloadCooldownMinutes: draft.overloadCooldownMinutes as number,
      });
      if (!alive.current) return;
      setSettings(next);
      setDraft(toDraft(next.effective, next.defaults));
      toast.success('Settings saved');
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.code === 'INVALID_SETTING' && e.extra.field) {
        setFieldErrors({ [e.extra.field]: e.detail });
      } else {
        setSaveError(errorMessage(e));
      }
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const thinkingDefault = settings.defaults.thinkingLevel || 'none';

  return (
    <form className="settings-form" onSubmit={save} noValidate>
      {!settings.configured && (
        <p className="settings-form__note muted">Translation is off until GEMINI_API_KEY is set.</p>
      )}
      {saveError && <Alert title={saveError.title} hint={saveError.hint} />}

      <Field
        label="Main model"
        hint={`Default: ${settings.defaults.model}${models !== null && models.length === 0 ? '. Could not load the model list' : ''}`}
        error={fieldErrors.model}
      >
        {(f) => (
          <div className="settings-form__row">
            <div className="settings-form__control">
              <Combobox
                id={f.id}
                value={draft.model}
                onChange={(v) => set('model', v)}
                suggestions={models ?? []}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid}
              />
            </div>
            {reset('model', 'main model')}
          </div>
        )}
      </Field>

      <Field
        label="Fallback models"
        hint={`Default: ${settings.defaults.fallbackModels.length > 0 ? settings.defaults.fallbackModels.join(', ') : 'none'}. Asked in this order when the main model is busy or out of quota.`}
        error={fieldErrors.fallbackModels}
      >
        {(f) => (
          <div className="settings-form__row">
            <div className="settings-form__control">
              <ModelListEditor
                id={f.id}
                models={draft.fallbackModels}
                onChange={(m) => set('fallbackModels', m)}
                suggestions={models ?? []}
                exclude={[draft.model.trim()]}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid}
              />
            </div>
            {reset('fallbackModels', 'fallback models')}
          </div>
        )}
      </Field>

      <Field label="Thinking level" hint={`Default: ${thinkingDefault}`} error={fieldErrors.thinkingLevel}>
        {(f) => (
          <div className="settings-form__row">
            <div className="settings-form__control">
              <Select
                id={f.id}
                value={draft.thinkingLevel}
                onChange={(v) => set('thinkingLevel', v)}
                options={[
                  { value: '', label: `Default (${thinkingDefault})` },
                  ...THINKING.map((level) => ({ value: level, label: level })),
                ]}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid}
              />
            </div>
            {reset('thinkingLevel', 'thinking level')}
          </div>
        )}
      </Field>

      <Field label="Temperature" hint={`Default: ${settings.defaults.temperature}. From 0 to 2.`} error={fieldErrors.temperature}>
        {(f) => (
          <div className="settings-form__row">
            <div className="settings-form__control settings-form__control--short">
              <input
                id={f.id}
                type="number"
                inputMode="decimal"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) => set('temperature', e.target.value)}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid || undefined}
              />
            </div>
            {reset('temperature', 'temperature')}
          </div>
        )}
      </Field>

      <Field
        label="Timeout (seconds)"
        hint={`Default: ${settings.defaults.timeoutSeconds}. From 10 seconds to 10 minutes.`}
        error={fieldErrors.timeoutSeconds}
      >
        {(f) => (
          <div className="settings-form__row">
            <div className="settings-form__control settings-form__control--short">
              <NumberField
                id={f.id}
                value={draft.timeoutSeconds}
                onChange={(v) => set('timeoutSeconds', v)}
                min={10}
                max={600}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid}
              />
            </div>
            {reset('timeoutSeconds', 'timeout')}
          </div>
        )}
      </Field>

      <Field
        label="Overload rest (minutes)"
        hint={`Default: ${settings.defaults.overloadCooldownMinutes}. A model that answers "overloaded" is skipped this long. 0 turns it off.`}
        error={fieldErrors.overloadCooldownMinutes}
      >
        {(f) => (
          <div className="settings-form__row">
            <div className="settings-form__control settings-form__control--short">
              <NumberField
                id={f.id}
                value={draft.overloadCooldownMinutes}
                onChange={(v) => set('overloadCooldownMinutes', v)}
                min={0}
                max={60}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid}
              />
            </div>
            {reset('overloadCooldownMinutes', 'overload rest')}
          </div>
        )}
      </Field>

      <FormActions sticky>
        <button type="button" className="button" disabled={!dirty || saving} onClick={() => { setDraft(saved); setFieldErrors({}); setSaveError(null); }}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </FormActions>
    </form>
  );
}
