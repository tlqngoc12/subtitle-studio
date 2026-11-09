package com.subtitlestudio.test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** A clock tests can move forward and reset (Spring caches test contexts, so reset it per test). */
public final class MutableClock extends Clock {
    private final Instant start;
    private Instant now;

    public MutableClock(Instant start) {
        this.start = start;
        this.now = start;
    }

    public void reset() {
        now = start;
    }

    public void set(Instant instant) {
        now = instant;
    }

    public void advance(Duration d) {
        now = now.plus(d);
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        return now;
    }
}
