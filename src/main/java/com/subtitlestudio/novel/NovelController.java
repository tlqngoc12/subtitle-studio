package com.subtitlestudio.novel;

import com.subtitlestudio.novel.wattpad.WattpadImportRequest;
import com.subtitlestudio.novel.wattpad.WattpadImportResult;
import com.subtitlestudio.novel.wattpad.WattpadNovelPreview;
import com.subtitlestudio.novel.wattpad.WattpadPartRow;
import com.subtitlestudio.novel.wattpad.WattpadNovelService;
import com.subtitlestudio.novel.wattpad.WattpadUrlRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Novels API (spec section 6). */
@RestController
@RequestMapping("/api/novels")
public class NovelController {

    private final NovelService service;
    private final NotebookService notebook;
    private final ChapterService chapterService;
    private final WattpadNovelService wattpadNovels;

    public NovelController(NovelService service, NotebookService notebook, ChapterService chapterService,
                           WattpadNovelService wattpadNovels) {
        this.wattpadNovels = wattpadNovels;
        this.service = service;
        this.notebook = notebook;
        this.chapterService = chapterService;
    }

    @PutMapping("/{id}/chapters/order")
    public List<ChapterSummary> reorderChapters(@PathVariable long id, @RequestBody ChapterOrderRequest request) {
        chapterService.reorderChapters(id, request);
        return service.get(id).chapters();
    }

    @GetMapping("/{id}/notebook")
    public NotebookView notebook(@PathVariable long id, @RequestParam(required = false) Integer after) {
        return notebook.view(id, after);
    }

    @PostMapping("/{id}/notebook/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void retryNotebook(@PathVariable long id) {
        notebook.retry(id);
    }

    @PostMapping("/wattpad/preview")
    public WattpadNovelPreview wattpadPreview(@RequestBody WattpadUrlRequest request) {
        return wattpadNovels.preview(request.url());
    }

    @GetMapping("/{id}/wattpad/parts")
    public List<WattpadPartRow> wattpadParts(@PathVariable long id) {
        return wattpadNovels.parts(id);
    }

    @PostMapping("/{id}/wattpad/import")
    public WattpadImportResult wattpadImport(@PathVariable long id, @RequestBody WattpadImportRequest request) {
        return wattpadNovels.importParts(id, request.partIds());
    }

    @GetMapping
    public List<NovelSummary> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public NovelDetail create(@RequestBody NovelRequest request) {
        return request.sourceType() == NovelSourceType.WATTPAD ? wattpadNovels.create(request)
                : service.create(request);
    }

    @GetMapping("/{id}")
    public NovelDetail get(@PathVariable long id) {
        return service.get(id);
    }

    @PutMapping("/{id}")
    public NovelDetail update(@PathVariable long id, @RequestBody NovelRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }
}
