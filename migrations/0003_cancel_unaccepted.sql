DROP TRIGGER cancel_jobs;
CREATE TRIGGER cancel_jobs AFTER UPDATE OF state ON posts WHEN NEW.state='cancelled' BEGIN
 UPDATE jobs SET state='cancelled', safe_retry=0, updated=NEW.updated
 WHERE post_id=NEW.id AND revision=OLD.revision
 AND (state='queued' OR (state='failed' AND safe_retry=1 AND external_id IS NULL));
END;
