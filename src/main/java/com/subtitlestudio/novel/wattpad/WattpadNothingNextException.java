package com.subtitlestudio.novel.wattpad;

/** "Fetch &amp; translate next" found no part left: every Wattpad part is deleted or already translated. */
public class WattpadNothingNextException extends RuntimeException {

    public static final String CODE = "WATTPAD_NOTHING_NEXT";

    public WattpadNothingNextException() {
        super("Every Wattpad part is already translated.");
    }
}
