import type { ViCue, VideoDto } from '../api/client';
import type { PlaylistDetail, PlaylistSummary } from '../api/playlists';
import type { Fanfic } from '../api/fanfics';
import type { PhotoPost } from '../api/photos';
import type { ProfilePage } from '../api/profiles';
import type { Work, WorkSummary } from '../api/works';

/**
 * What the public site knows about a video: exactly the fields the backend exports (PublicVideo.java).
 * Pages that also run on the public site may only read these fields.
 */
export type PublicVideo = Pick<
  VideoDto,
  'id' | 'title' | 'channel' | 'durationSec' | 'thumbnailUrl' | 'viCueCount' | 'viUpdatedAt' | 'viSource'
>;

export type PublicPlaylistSummary = Omit<PlaylistSummary, 'containsVideo'>;

export type PublicPlaylistDetail = Omit<PlaylistDetail, 'videos'> & { videos: PublicVideo[] };

/** Read-only data for the pages guests see; backed by the API (admin app) or by static JSON (public site). */
export interface ReadSource {
  listVideos(): Promise<PublicVideo[]>;
  getVideo(id: string): Promise<PublicVideo>;
  getVietsub(id: string): Promise<ViCue[]>;
  listPlaylists(): Promise<PublicPlaylistSummary[]>;
  getPlaylist(id: number): Promise<PublicPlaylistDetail>;
  getProfilePage(): Promise<ProfilePage>;
  listPhotos(): Promise<PhotoPost[]>;
  listFanfics(): Promise<Fanfic[]>;
  listWorks(): Promise<WorkSummary[]>;
  getWork(id: number): Promise<Work>;
}
