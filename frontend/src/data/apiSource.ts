import { getVideo, getVietsub, listVideos } from '../api/client';
import { getPlaylist, listPlaylists } from '../api/playlists';
import { listPhotos } from '../api/photos';
import { getProfilePage } from '../api/profiles';
import { getWork, listWorks } from '../api/works';
import type { ReadSource } from './types';

/** The admin app's data: the live REST API. */
export const apiSource: ReadSource = {
  listVideos,
  getVideo,
  getVietsub,
  listPlaylists: () => listPlaylists(),
  getPlaylist,
  getProfilePage,
  listPhotos,
  listWorks,
  getWork,
};
