-- Small-workspace storage on D1 Free; no object-storage subscription required.
CREATE TABLE media_storage (
 id INTEGER PRIMARY KEY CHECK(id=1),
 used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes>=0)
);
INSERT INTO media_storage(id,used_bytes) VALUES(1,0);
CREATE TABLE media_bytes (
 media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
 data BLOB NOT NULL CHECK(typeof(data)='blob' AND length(data) BETWEEN 1 AND 1048576)
);
CREATE TRIGGER media_capacity BEFORE INSERT ON media_bytes BEGIN
 SELECT RAISE(ABORT,'MEDIA_CAPACITY') WHERE
 (SELECT used_bytes FROM media_storage WHERE id=1)+length(NEW.data)>104857600;
END;
CREATE TRIGGER media_storage_add AFTER INSERT ON media_bytes BEGIN
 UPDATE media_storage SET used_bytes=used_bytes+length(NEW.data) WHERE id=1;
END;
CREATE TRIGGER media_storage_remove AFTER DELETE ON media_bytes BEGIN
 UPDATE media_storage SET used_bytes=used_bytes-length(OLD.data) WHERE id=1;
END;
CREATE TRIGGER media_bytes_immutable BEFORE UPDATE ON media_bytes BEGIN
 SELECT RAISE(ABORT,'Media bytes are immutable');
END;
