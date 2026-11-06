PRAGMA foreign_keys=ON;
CREATE TABLE organization (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, timezone TEXT NOT NULL, provider_pause INTEGER NOT NULL DEFAULT 0);
INSERT INTO organization(id,name,timezone) VALUES(1,'NGO Social Studio','UTC');
CREATE TABLE members (email TEXT PRIMARY KEY COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('designer','administrator')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE media (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES members(email), name TEXT NOT NULL, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX media_owner ON media(owner,created);
CREATE TABLE channels (platform TEXT PRIMARY KEY CHECK(platform IN ('linkedin','instagram','facebook')), external_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
CREATE TABLE posts (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES members(email), revision INTEGER NOT NULL DEFAULT 1, caption TEXT NOT NULL DEFAULT '', variants TEXT NOT NULL CHECK(json_valid(variants)), media_id TEXT REFERENCES media(id), state TEXT NOT NULL CHECK(state IN ('draft','submitted','approved','changes_requested','rejected','dispatch','cancelled')), actor TEXT NOT NULL REFERENCES members(email), note TEXT NOT NULL DEFAULT '', due INTEGER, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX posts_owner_state ON posts(owner,state,updated);
CREATE TABLE events (id INTEGER PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), revision INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX events_post ON events(post_id,id);
CREATE TRIGGER record_create AFTER INSERT ON posts BEGIN
 INSERT INTO events(post_id,revision,actor,action,note,at) VALUES(NEW.id,NEW.revision,NEW.actor,NEW.state,NEW.note,NEW.updated);
END;
CREATE TRIGGER record_change AFTER UPDATE ON posts BEGIN
 INSERT INTO events(post_id,revision,actor,action,note,at) VALUES(NEW.id,NEW.revision,NEW.actor,NEW.state,NEW.note,NEW.updated);
END;
CREATE TABLE jobs (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), revision INTEGER NOT NULL, platform TEXT NOT NULL, channel_id TEXT NOT NULL, caption TEXT NOT NULL, media_id TEXT NOT NULL REFERENCES media(id), token TEXT NOT NULL UNIQUE, due INTEGER, state TEXT NOT NULL CHECK(state IN ('queued','sending','scheduled','published','failed','unknown','cancelled')), external_id TEXT UNIQUE, error TEXT NOT NULL DEFAULT '', safe_retry INTEGER NOT NULL DEFAULT 0, next_check INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(post_id,revision,platform));
CREATE INDEX jobs_work ON jobs(state,next_check);
CREATE TABLE attempts (id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), state TEXT NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TRIGGER record_attempt AFTER UPDATE OF state ON jobs BEGIN
 INSERT INTO attempts(job_id,state,detail,at) VALUES(NEW.id,NEW.state,NEW.error,NEW.updated);
END;
-- Freeze the approved content, channel and media in the same transaction as authorization.
CREATE TRIGGER enqueue AFTER UPDATE OF state ON posts WHEN NEW.state='dispatch' AND OLD.state='approved' BEGIN
 INSERT INTO jobs(id,post_id,revision,platform,channel_id,caption,media_id,token,due,state,next_check,updated)
 SELECT lower(hex(randomblob(16))), NEW.id, NEW.revision, v.key,
 (SELECT external_id FROM channels WHERE platform=v.key), COALESCE(NULLIF(v.value,''),NEW.caption),
 NEW.media_id, lower(hex(randomblob(32))), NEW.due, 'queued', NEW.updated, NEW.updated FROM json_each(NEW.variants) v;
END;
CREATE TRIGGER cancel_jobs AFTER UPDATE OF state ON posts WHEN NEW.state='cancelled' BEGIN
 UPDATE jobs SET state='cancelled',updated=NEW.updated WHERE post_id=NEW.id AND state='queued';
END;
