import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync("migrations/" + file, "utf8"));
  }
  db.exec("INSERT INTO members VALUES('designer@local.test','designer',1)");
});
afterEach(() => db.close());

function upload(id: string, data: Uint8Array) {
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO media VALUES(?,'designer@local.test','Graphic','image/png',1,1,?,0)",
    ).run(id, data.length);
    db.prepare("INSERT INTO media_bytes VALUES(?,?)").run(id, data);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

describe("database media capacity", () => {
  it("stores the original bytes and reclaims capacity when metadata is deleted", () => {
    const data = new Uint8Array([0, 128, 255, 42]);
    upload("first", data);
    expect(db.prepare("SELECT data FROM media_bytes").get()?.data).toEqual(
      data,
    );
    expect(
      db.prepare("SELECT used_bytes FROM media_storage").get()?.used_bytes,
    ).toBe(4);
    expect(() => db.prepare("UPDATE media_bytes SET data=?").run(data)).toThrow(
      /immutable/,
    );
    db.exec("DELETE FROM media");
    expect(
      db.prepare("SELECT count(*) AS total FROM media_bytes").get()?.total,
    ).toBe(0);
    expect(
      db.prepare("SELECT used_bytes FROM media_storage").get()?.used_bytes,
    ).toBe(0);
  });

  it("enforces the shared limit inside the transaction and leaves no orphan metadata", () => {
    db.exec("UPDATE media_storage SET used_bytes=104857596");
    upload("last", new Uint8Array(4));
    expect(() => upload("overflow", new Uint8Array(1))).toThrow(
      /MEDIA_CAPACITY/,
    );
    expect(
      db
        .prepare("SELECT count(*) AS total FROM media WHERE id='overflow'")
        .get()?.total,
    ).toBe(0);
    expect(
      db.prepare("SELECT used_bytes FROM media_storage").get()?.used_bytes,
    ).toBe(104857600);
  });

  it("rejects images above one MiB and rolls back their metadata", () => {
    expect(() => upload("oversize", new Uint8Array(1048577))).toThrow(/CHECK/);
    expect(db.prepare("SELECT count(*) AS total FROM media").get()?.total).toBe(
      0,
    );
    expect(
      db.prepare("SELECT used_bytes FROM media_storage").get()?.used_bytes,
    ).toBe(0);
  });
});
