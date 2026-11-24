package com.subtitlestudio.publish;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** In-memory {@link R2ImageStore} that records what happens to it and can be told to fail. */
class FakeR2Store implements R2ImageStore {

    private final Set<String> keys = ConcurrentHashMap.newKeySet();
    private final List<String> puts = new CopyOnWriteArrayList<>();
    private final List<String> deleted = new CopyOnWriteArrayList<>();
    private final List<String> events = new CopyOnWriteArrayList<>();
    private final Map<String, String> contentTypes = new ConcurrentHashMap<>();
    private final Set<String> failingPuts = ConcurrentHashMap.newKeySet();
    private volatile boolean failDelete;
    private volatile boolean failList;
    private volatile Runnable beforePut = () -> {};

    void seed(String... seeded) {
        keys.addAll(List.of(seeded));
    }

    void failPut(String key) {
        failingPuts.add(key);
    }

    void failDelete() {
        failDelete = true;
    }

    void failList() {
        failList = true;
    }

    /** Runs before every put, e.g. to block it on a latch. */
    void beforePut(Runnable hook) {
        beforePut = hook;
    }

    List<String> puts() {
        return new ArrayList<>(puts);
    }

    List<String> deleted() {
        return new ArrayList<>(deleted);
    }

    /** "list", "put KEY" and "delete" in the order they happened. */
    List<String> events() {
        return new ArrayList<>(events);
    }

    /** Records a step done outside the store (the deploy) in {@link #events()}. */
    void note(String event) {
        events.add(event);
    }

    String contentTypeOf(String key) {
        return contentTypes.get(key);
    }

    @Override
    public Set<String> listKeys(String prefix) {
        events.add("list");
        if (failList) {
            throw new IllegalStateException("list failed");
        }
        Set<String> out = new TreeSet<>();
        for (String k : keys) {
            if (k.startsWith(prefix)) {
                out.add(k);
            }
        }
        return out;
    }

    @Override
    public void put(String key, Path file, String contentType) {
        beforePut.run();
        if (failingPuts.contains(key)) {
            throw new IllegalStateException("put failed");
        }
        events.add("put " + key);
        puts.add(key);
        contentTypes.put(key, contentType);
        keys.add(key);
    }

    @Override
    public void delete(Collection<String> toDelete) {
        events.add("delete");
        if (failDelete) {
            throw new IllegalStateException("delete failed");
        }
        deleted.addAll(toDelete);
        keys.removeAll(toDelete);
    }
}
