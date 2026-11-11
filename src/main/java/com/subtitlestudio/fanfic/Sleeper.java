package com.subtitlestudio.fanfic;

import org.springframework.stereotype.Component;

/** Pause between Wattpad calls; tests replace it so Refresh all does not really wait. */
public interface Sleeper {

    void sleep(long millis);

    @Component
    class Real implements Sleeper {

        @Override
        public void sleep(long millis) {
            try {
                Thread.sleep(millis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
