package com.subtitlestudio.novel.wattpad;

import java.util.List;

/** Every part of the story in Wattpad order, minus the up-to-date ones that are only counted. */
public record WattpadSyncPlan(List<SyncPlanItem> parts, int upToDate) {
}
