package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.UnknownProfileException;
import java.util.List;
import java.util.function.UnaryOperator;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Translation profiles for novels: {@code {dataDir}/prompts/novels/<Name>.md}, kept apart from the Vietsub profiles so
 * each dropdown only offers its own kind. Same rules as {@link PromptProfileStore} (names, 20 KB, UTF-8).
 */
@Component
public class NovelProfileStore {

    static final String EXAMPLE = "prompts/_novel_example.md";

    private final PromptProfileStore store;
    private final PromptProfileStore vietsub;

    public NovelProfileStore(SubtitleStudioProperties properties, PromptProfileStore vietsub) {
        this.store = new PromptProfileStore(properties.novelPromptsDir(), EXAMPLE);
        this.vietsub = vietsub;
    }

    /** Usable novel profile names, sorted case-insensitively. */
    public List<String> list() {
        return store.list();
    }

    /** The profile text; throws {@link UnknownProfileException} when it is missing or unusable. */
    public String read(String name) {
        return store.read(name);
    }

    /** Writes a new profile; throws {@code ProfileExistsException} instead of overwriting. */
    public void create(String name, String text) {
        store.create(name, text);
    }

    /** SHA-256 of the profile text as stored; the editor sends it back to detect a changed file. */
    public String sha(String name) {
        return store.sha(name);
    }

    /**
     * Replaces a profile, keeping the old file in {@code .history/}; throws {@code ProfileChangedException} when the file
     * no longer has {@code baseSha}. Returns the SHA-256 of the new text.
     */
    public String write(String name, String text, String baseSha) {
        return store.write(name, text, baseSha);
    }

    /** Renames a profile with its history, applying {@code edit} to the text; see {@link PromptProfileStore#rename}. */
    public void rename(String from, String to, UnaryOperator<String> edit) {
        store.rename(from, to, edit);
    }

    public boolean exists(String name) {
        return store.exists(name);
    }

    /** Removes a profile file (used to undo a create); a missing file is ignored. */
    public void delete(String name) {
        store.delete(name);
    }

    /**
     * Installs the novel example when its folder is missing. The Vietsub example goes first: it is installed only when
     * {@code prompts/} does not exist yet, and creating {@code prompts/novels/} would create it.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void installExampleIfMissing() {
        vietsub.installExampleIfMissing();
        store.installExampleIfMissing();
    }
}
