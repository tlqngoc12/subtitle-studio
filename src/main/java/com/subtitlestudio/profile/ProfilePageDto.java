package com.subtitlestudio.profile;

import java.util.List;

/** The whole Profile page: the EmiBonnie group (banner, avatar) and the members, in page order. */
public record ProfilePageDto(ProfileDto group, List<ProfileDto> members) {
}
