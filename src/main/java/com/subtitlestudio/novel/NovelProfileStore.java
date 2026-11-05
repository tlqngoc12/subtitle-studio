package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.UnknownProfileException;
import java.util.List;
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
