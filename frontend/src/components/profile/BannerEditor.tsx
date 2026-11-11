import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  addBannerImage,
  deleteBannerImage,
  reorderBanner,
  updateBannerAltText,
  type BannerImage,
} from '../../api/profiles';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Tip } from '../Tip';
import { Alert } from '../ui/Alert';
import { useConfirmDialog } from '../useConfirmDialog';
import { ImageDropzone, previewOf, toPicked, type PickedImage } from '../ui/ImageDropzone';
import './BannerEditor.css';

export const MAX_BANNER_IMAGES = 8;

/** A rejected list or limit shows the server's own sentence; anything else maps from its code. */
function failure(e: unknown): ErrorMessage {
  if (e instanceof ApiError && e.fieldErrors.length > 0) return { title: e.fieldErrors[0].message };
  return errorMessage(e);
}

/**
 * The Banner section of a profile's Edit mode: thumbnails in order (drag, or Move left / Move right), an editable
 * description under each, Delete with a confirmation, and an Add flow (image + optional description, at most 8).
 * Every call returns the whole banner, which goes to `onChange`; a reorder shows at once and is undone on failure.
 */
export function BannerEditor({
  slug,
  images,
  onChange,
}: {
  slug: string;
  images: BannerImage[];
  onChange: (images: BannerImage[]) => void;
}) {
  const { confirm, dialog } = useConfirmDialog();
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function reorder(next: BannerImage[]) {
    const previous = images;
    setError(null);
    setSaving(true);
    onChange(next);
    try {
      onChange(await reorderBanner(slug, next.map((i) => i.id)));
    } catch (e) {
      onChange(previous);
      setError(failure(e));
    } finally {
      setSaving(false);
    }
  }

  function move(from: number, to: number) {
    if (saving || from === to || to < 0 || to >= images.length) return;
    void reorder(arrayMove(images, from, to));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(
      images.findIndex((i) => i.id === active.id),
      images.findIndex((i) => i.id === over.id),
    );
  }

  async function remove(image: BannerImage) {
    if (!(await confirm({ title: 'Delete this image?', confirmLabel: 'Delete', destructive: true }))) return;
    setError(null);
    try {
      onChange(await deleteBannerImage(slug, image.id));
    } catch (e) {
      setError(failure(e));
    }
  }

  /** Resolves to the field's error message, or null when it was saved. */
  async function saveDescription(image: BannerImage, altText: string | null): Promise<string | null> {
    setError(null);
    try {
      onChange(await updateBannerAltText(slug, image.id, altText));
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors.some((f) => f.field === 'altText')) {
        return e.fieldErrors.find((f) => f.field === 'altText')!.message;
      }
      setError(failure(e));
      return failure(e).title;
    }
  }

  return (
    <section className="banner-editor" aria-labelledby="banner-editor-title">
      {dialog}
      <h2 id="banner-editor-title" className="banner-editor__title">
        Banner
      </h2>
      <p className="field__hint">Images fanned at the top of the page. Up to {MAX_BANNER_IMAGES}.</p>
      {error && <Alert title={error.title} hint={error.hint} />}

      {images.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
            <ul className="banner-editor__grid" aria-label="Banner images">
              {images.map((image, i) => (
                <BannerThumb
                  key={image.id}
                  image={image}
                  number={i + 1}
                  first={i === 0}
                  last={i === images.length - 1}
                  locked={saving}
                  onMove={(by) => move(i, i + by)}
                  onDelete={() => void remove(image)}
                  onSaveDescription={(text) => saveDescription(image, text)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <AddImage slug={slug} full={images.length >= MAX_BANNER_IMAGES} onAdded={onChange} onError={setError} />
    </section>
  );
}

function BannerThumb({
  image,
  number,
  first,
  last,
  locked,
  onMove,
  onDelete,
  onSaveDescription,
}: {
  image: BannerImage;
  number: number;
  first: boolean;
  last: boolean;
  locked: boolean;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onSaveDescription: (altText: string | null) => Promise<string | null>;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled: locked,
  });
  const errorId = useId();
  const [text, setText] = useState(image.altText ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inFlight = useRef<string | null>(null);

  // The server's value wins after a save or a reload.
  useEffect(() => setText(image.altText ?? ''), [image.altText]);

  async function commit() {
    const next = text.trim();
    if (next === (image.altText ?? '') || inFlight.current === next) return;
    inFlight.current = next;
    setFieldError(await onSaveDescription(next === '' ? null : next));
    inFlight.current = null;
  }

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'banner-thumb banner-thumb--dragging' : 'banner-thumb'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {image.mediaUrl ? (
        <img className="banner-thumb__shot" src={image.mediaUrl} alt={image.altText?.trim() || `Banner image ${number}`} />
      ) : (
        <span className="banner-thumb__shot banner-thumb__shot--empty">Image missing</span>
      )}
      <span className="banner-thumb__bar">
        <button
          ref={setActivatorNodeRef}
          className="button button--icon"
          type="button"
          aria-label={`Drag to reorder: image ${number}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="icon" aria-hidden="true" />
        </button>
        <Tip label="Move left">
          <button
            className="button button--icon"
            type="button"
            disabled={locked || first}
            aria-label={`Move image ${number} left`}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft className="icon" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Move right">
          <button
            className="button button--icon"
            type="button"
            disabled={locked || last}
            aria-label={`Move image ${number} right`}
            onClick={() => onMove(1)}
          >
            <ArrowRight className="icon" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Delete image">
          <button
            className="button button--icon button--danger"
            type="button"
            disabled={locked}
            aria-label={`Delete image ${number}`}
            onClick={onDelete}
          >
            <Trash2 className="icon" aria-hidden="true" />
          </button>
        </Tip>
      </span>
      <div className="field">
        <input
          type="text"
          aria-label={`Description of image ${number}`}
          placeholder="Image description"
          value={text}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
        />
        {fieldError && (
          <p id={errorId} className="field__error">
            {fieldError}
          </p>
        )}
      </div>
    </li>
  );
}

function AddImage({
  slug,
  full,
  onAdded,
  onError,
}: {
  slug: string;
  full: boolean;
  onAdded: (images: BannerImage[]) => void;
  onError: (error: ErrorMessage | null) => void;
}) {
  const ids = useId();
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [round, setRound] = useState(0); // remounts the file picker after each added image

  async function add() {
    if (!picked) return;
    onError(null);
    setFieldError(null);
    setAdding(true);
    try {
      onAdded(await addBannerImage(slug, picked.mediaId, description.trim() || null));
      setPicked(null);
      setDescription('');
      setRound((r) => r + 1);
    } catch (e) {
      const altText = e instanceof ApiError ? e.fieldErrors.find((f) => f.field === 'altText') : undefined;
      if (altText) setFieldError(altText.message);
      else onError(failure(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <fieldset className="banner-editor__add" disabled={full}>
      <legend>Add image</legend>
      <ImageDropzone
        key={round}
        label="Banner image"
        value={previewOf(picked)}
        aspect="auto"
        maxSide={1600}
        onUploaded={(media) => setPicked(toPicked(media))}
        onBusyChange={setUploading}
      />
      <div className="field">
        <label htmlFor={`${ids}-alt`}>Image description (optional)</label>
        <input
          id={`${ids}-alt`}
          type="text"
          value={description}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={`${ids}-hint${fieldError ? ` ${ids}-error` : ''}`}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p id={`${ids}-hint`} className="field__hint">
          Read by screen readers; not shown on the page.
        </p>
        {fieldError && (
          <p id={`${ids}-error`} className="field__error">
            {fieldError}
          </p>
        )}
      </div>
      <div className="banner-editor__actions">
        <button type="button" className="button button--s" disabled={!picked || uploading || adding} onClick={() => void add()}>
          <Plus className="icon" aria-hidden="true" />
          Add
        </button>
        {full && <span className="field__hint">Up to {MAX_BANNER_IMAGES} images</span>}
      </div>
    </fieldset>
  );
}
