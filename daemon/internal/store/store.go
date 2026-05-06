package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	sql *sql.DB
}

func Open(path string) (*DB, error) {
	// modernc.org/sqlite registers as "sqlite". DSN params use the same names
	// as cgo go-sqlite3 but with leading "_pragma=" prefix; the simpler form
	// here just turns on WAL and FK enforcement.
	s, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(on)")
	if err != nil {
		return nil, err
	}
	if err := s.Ping(); err != nil {
		return nil, err
	}
	db := &DB{sql: s}
	if err := db.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

func (db *DB) Close() error { return db.sql.Close() }

// migrations are applied in order, exactly once each. We track the highest
// applied index in PRAGMA user_version. Add new entries to the bottom — never
// edit a migration that's already shipped, since some users will have run it.
var migrations = []string{
	// 1: initial schema.
	`CREATE TABLE IF NOT EXISTS orgs (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		tailnet TEXT,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL UNIQUE,
		name TEXT,
		org_id TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'member',
		created_at INTEGER NOT NULL,
		FOREIGN KEY(org_id) REFERENCES orgs(id)
	);
	CREATE TABLE IF NOT EXISTS apps (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		owner_id TEXT NOT NULL,
		name TEXT NOT NULL,
		source_path TEXT NOT NULL,
		framework TEXT,
		port INTEGER,
		container_id TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		tailnet_url TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		FOREIGN KEY(org_id) REFERENCES orgs(id),
		FOREIGN KEY(owner_id) REFERENCES users(id),
		UNIQUE(org_id, name)
	);
	CREATE TABLE IF NOT EXISTS app_access (
		app_id TEXT NOT NULL,
		user_email TEXT NOT NULL,
		granted_by TEXT NOT NULL,
		granted_at INTEGER NOT NULL,
		PRIMARY KEY(app_id, user_email),
		FOREIGN KEY(app_id) REFERENCES apps(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS access_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		app_id TEXT NOT NULL,
		actor TEXT,
		action TEXT NOT NULL,
		detail TEXT,
		at INTEGER NOT NULL
	);`,
	// 2: drop the FK on apps.owner_id. We don't mirror auth identities into the
	// users table (Firebase is the source of truth), so the constraint blocked
	// every deploy in dev mode. SQLite can't drop a column constraint in place,
	// so we recreate the table.
	`PRAGMA foreign_keys=off;
	CREATE TABLE apps_new (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		owner_id TEXT NOT NULL,
		name TEXT NOT NULL,
		source_path TEXT NOT NULL,
		framework TEXT,
		port INTEGER,
		container_id TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		tailnet_url TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		FOREIGN KEY(org_id) REFERENCES orgs(id),
		UNIQUE(org_id, name)
	);
	INSERT INTO apps_new SELECT * FROM apps;
	DROP TABLE apps;
	ALTER TABLE apps_new RENAME TO apps;
	PRAGMA foreign_keys=on;`,
	// 3: split tailnet_url into local_url + tailnet_url. The previous schema
	// stuffed `http://localhost:NNNN` into tailnet_url whenever Tailscale Serve
	// hadn't published the app, which made the UI think the app was shareable
	// when it wasn't. Now: local_url is the always-present 127.0.0.1 form,
	// tailnet_url is empty until Serve actually publishes.
	`ALTER TABLE apps ADD COLUMN local_url TEXT;
	UPDATE apps SET local_url = tailnet_url WHERE tailnet_url LIKE 'http://localhost:%' OR tailnet_url LIKE 'http://127.0.0.1:%';
	UPDATE apps SET tailnet_url = '' WHERE tailnet_url LIKE 'http://localhost:%' OR tailnet_url LIKE 'http://127.0.0.1:%';`,
}

func (db *DB) migrate() error {
	var version int
	if err := db.sql.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	for i := version; i < len(migrations); i++ {
		tx, err := db.sql.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %d: %w", i+1, err)
		}
		// PRAGMA can't be parameterized; safe because i is bounded above.
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

type Org struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Tailnet   string `json:"tailnet,omitempty"`
	CreatedAt int64  `json:"created_at"`
}

type App struct {
	ID          string `json:"id"`
	OrgID       string `json:"org_id"`
	OwnerID     string `json:"owner_id"`
	Name        string `json:"name"`
	SourcePath  string `json:"source_path"`
	Framework   string `json:"framework,omitempty"`
	Port        int    `json:"port,omitempty"`
	ContainerID string `json:"container_id,omitempty"`
	Status      string `json:"status"`
	// LocalURL is always set after a successful deploy — it points at the
	// Docker port mapping on 127.0.0.1 and only works on the operator's
	// machine.
	LocalURL string `json:"local_url,omitempty"`
	// TailnetURL is only set when Tailscale Serve has actually published
	// the app. Empty until then; the renderer keys "this app is shareable"
	// off the presence of this field.
	TailnetURL string `json:"tailnet_url,omitempty"`
	CreatedAt  int64  `json:"created_at"`
	UpdatedAt  int64  `json:"updated_at"`
}

type Access struct {
	AppID     string `json:"app_id"`
	UserEmail string `json:"user_email"`
	GrantedBy string `json:"granted_by"`
	GrantedAt int64  `json:"granted_at"`
}

var ErrNotFound = errors.New("not found")

func (db *DB) CreateOrg(o Org) error {
	_, err := db.sql.Exec(
		`INSERT INTO orgs (id, name, tailnet, created_at) VALUES (?, ?, ?, ?)`,
		o.ID, o.Name, o.Tailnet, o.CreatedAt,
	)
	return err
}

func (db *DB) GetOrg(id string) (*Org, error) {
	row := db.sql.QueryRow(`SELECT id, name, tailnet, created_at FROM orgs WHERE id = ?`, id)
	var o Org
	if err := row.Scan(&o.ID, &o.Name, &o.Tailnet, &o.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &o, nil
}

func (db *DB) FirstOrg() (*Org, error) {
	row := db.sql.QueryRow(`SELECT id, name, tailnet, created_at FROM orgs ORDER BY created_at ASC LIMIT 1`)
	var o Org
	if err := row.Scan(&o.ID, &o.Name, &o.Tailnet, &o.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &o, nil
}

func (db *DB) UpsertApp(a *App) error {
	now := time.Now().Unix()
	if a.CreatedAt == 0 {
		a.CreatedAt = now
	}
	a.UpdatedAt = now
	_, err := db.sql.Exec(`
		INSERT INTO apps (id, org_id, owner_id, name, source_path, framework, port, container_id, status, local_url, tailnet_url, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			source_path = excluded.source_path,
			framework = excluded.framework,
			port = excluded.port,
			container_id = excluded.container_id,
			status = excluded.status,
			local_url = excluded.local_url,
			tailnet_url = excluded.tailnet_url,
			updated_at = excluded.updated_at
	`, a.ID, a.OrgID, a.OwnerID, a.Name, a.SourcePath, a.Framework, a.Port,
		a.ContainerID, a.Status, a.LocalURL, a.TailnetURL, a.CreatedAt, a.UpdatedAt)
	return err
}

func (db *DB) GetAppByName(orgID, name string) (*App, error) {
	row := db.sql.QueryRow(`
		SELECT id, org_id, owner_id, name, source_path, framework, port, container_id, status, local_url, tailnet_url, created_at, updated_at
		FROM apps WHERE org_id = ? AND name = ?`, orgID, name)
	return scanApp(row)
}

func (db *DB) GetApp(id string) (*App, error) {
	row := db.sql.QueryRow(`
		SELECT id, org_id, owner_id, name, source_path, framework, port, container_id, status, local_url, tailnet_url, created_at, updated_at
		FROM apps WHERE id = ?`, id)
	return scanApp(row)
}

func (db *DB) ListApps(orgID string) ([]App, error) {
	rows, err := db.sql.Query(`
		SELECT id, org_id, owner_id, name, source_path, framework, port, container_id, status, local_url, tailnet_url, created_at, updated_at
		FROM apps WHERE org_id = ? ORDER BY updated_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var apps []App
	for rows.Next() {
		a, err := scanApp(rows)
		if err != nil {
			return nil, err
		}
		apps = append(apps, *a)
	}
	return apps, rows.Err()
}

func (db *DB) DeleteApp(id string) error {
	_, err := db.sql.Exec(`DELETE FROM apps WHERE id = ?`, id)
	return err
}

func (db *DB) GrantAccess(a Access) error {
	_, err := db.sql.Exec(`
		INSERT INTO app_access (app_id, user_email, granted_by, granted_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(app_id, user_email) DO NOTHING`,
		a.AppID, a.UserEmail, a.GrantedBy, a.GrantedAt)
	return err
}

func (db *DB) RevokeAccess(appID, email string) error {
	_, err := db.sql.Exec(`DELETE FROM app_access WHERE app_id = ? AND user_email = ?`, appID, email)
	return err
}

func (db *DB) ListAccess(appID string) ([]Access, error) {
	rows, err := db.sql.Query(`
		SELECT app_id, user_email, granted_by, granted_at
		FROM app_access WHERE app_id = ? ORDER BY granted_at ASC`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Access
	for rows.Next() {
		var x Access
		if err := rows.Scan(&x.AppID, &x.UserEmail, &x.GrantedBy, &x.GrantedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (db *DB) LogAccess(appID, actor, action, detail string) error {
	_, err := db.sql.Exec(
		`INSERT INTO access_log (app_id, actor, action, detail, at) VALUES (?, ?, ?, ?, ?)`,
		appID, actor, action, detail, time.Now().Unix(),
	)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanApp(r rowScanner) (*App, error) {
	var a App
	var framework, containerID, localURL, tailnetURL sql.NullString
	var port sql.NullInt64
	if err := r.Scan(&a.ID, &a.OrgID, &a.OwnerID, &a.Name, &a.SourcePath,
		&framework, &port, &containerID, &a.Status, &localURL, &tailnetURL,
		&a.CreatedAt, &a.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	a.Framework = framework.String
	a.ContainerID = containerID.String
	a.LocalURL = localURL.String
	a.TailnetURL = tailnetURL.String
	if port.Valid {
		a.Port = int(port.Int64)
	}
	return &a, nil
}
