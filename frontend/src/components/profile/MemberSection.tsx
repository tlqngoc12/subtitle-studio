import { useState, type ReactNode } from 'react';
import type { Profile } from '../../api/profiles';
import { ImageLightbox } from '../ui/ImageLightbox';
import { BlockView } from './BlockView';
import { SocialIcons } from './SocialIcons';
import './MemberSection.css';

/**
 * One member of the Profile page: portrait, name, tagline and social icons on one side, full name and the blocks
 * on the other. `side` is the side of the portrait; on narrow screens it stacks portrait first. LINKS blocks show
 * as icons under the portrait, so they are not repeated in the details. `children` is the admin area (menu,
 * editors) drawn below the details.
 */
export function MemberSection({
  profile,
  side,
  menu,
  children,
}: {
  profile: Profile;
  side: 'left' | 'right';
  /** Admin member menu, placed beside the name. */
  menu?: ReactNode;
  children?: ReactNode;
}) {
  const [zoom, setZoom] = useState(false);
  const detailBlocks = profile.blocks.filter((b) => b.type !== 'LINKS');
  const firstFacts = detailBlocks.find((b) => b.type === 'FACTS');
  const nameId = `member-${profile.slug}-name`;

  return (
    <section id={profile.slug} className={`member member--${side}`} aria-labelledby={nameId}>
      <div className="member__aside">
        {profile.portraitUrl ? (
          <>
            <button type="button" className="member__portrait" aria-label={`View larger: ${profile.displayName}`} onClick={() => setZoom(true)}>
              <img src={profile.portraitUrl} alt={profile.displayName} />
            </button>
            <ImageLightbox
              images={[{ src: profile.portraitUrl, alt: profile.displayName }]}
              index={zoom ? 0 : null}
              onIndexChange={() => undefined}
              onClose={() => setZoom(false)}
            />
          </>
        ) : (
          <div className="member__portrait member__portrait--empty" aria-hidden="true">
            {profile.displayName.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="member__name-row">
          <h2 className="member__name" id={nameId}>
            {profile.displayName}
          </h2>
          {menu}
        </div>
        {profile.tagline && <p className="member__tagline">{profile.tagline}</p>}
        <SocialIcons blocks={profile.blocks} />
      </div>

      <div className="member__details">
        {profile.fullName && <h3 className="member__full-name">{profile.fullName}</h3>}
        {detailBlocks.map((b) => (
          <BlockView key={b.id} block={b} plain hideTitle={b === firstFacts} />
        ))}
        {children}
      </div>
    </section>
  );
}
