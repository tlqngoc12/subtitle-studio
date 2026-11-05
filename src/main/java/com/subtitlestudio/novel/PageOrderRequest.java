package com.subtitlestudio.novel;

import java.util.List;

/** Every page id of the chapter, in the new order. */
public record PageOrderRequest(List<Long> pageIds) {
}
