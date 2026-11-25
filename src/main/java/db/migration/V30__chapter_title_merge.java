package db.migration;

import com.subtitlestudio.novel.ChapterTitles;
import com.subtitlestudio.novel.ChapterTitles.LegacyChapter;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Merges t_chapter.label into title (per novel, in reading order, see {@link ChapterTitles#migrate}) and drops
 * label. Never edit this file once it has run on a real database; add V31__... instead.
 */
public class V30__chapter_title_merge extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        List<Long> novelIds = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT id FROM t_novel")) {
            while (rs.next()) {
                novelIds.add(rs.getLong(1));
            }
        }
        for (long novelId : novelIds) {
            List<Long> ids = new ArrayList<>();
            List<LegacyChapter> chapters = new ArrayList<>();
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT id, label, title FROM t_chapter WHERE novel_id = ? ORDER BY sort_order, chapter_no")) {
                ps.setLong(1, novelId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        ids.add(rs.getLong(1));
                        chapters.add(new LegacyChapter(rs.getString(2), rs.getString(3)));
                    }
                }
            }
            List<String> titles = ChapterTitles.migrate(chapters);
            try (PreparedStatement ps = c.prepareStatement("UPDATE t_chapter SET title = ? WHERE id = ?")) {
                for (int i = 0; i < ids.size(); i++) {
                    ps.setString(1, titles.get(i));
                    ps.setLong(2, ids.get(i));
                    ps.addBatch();
                }
                ps.executeBatch();
            }
        }
        try (Statement st = c.createStatement()) {
            st.execute("ALTER TABLE t_chapter DROP COLUMN label");
        }
    }
}
