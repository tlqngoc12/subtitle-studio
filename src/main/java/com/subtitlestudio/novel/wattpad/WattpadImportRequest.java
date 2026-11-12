package com.subtitlestudio.novel.wattpad;

import java.util.List;

/** The Wattpad part ids to import as chapters. */
public record WattpadImportRequest(List<String> partIds) {
}
