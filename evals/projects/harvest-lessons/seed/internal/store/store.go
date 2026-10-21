package store

import (
	"context"
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", "file:"+path)
	if err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) SaveEvent(ctx context.Context, payload []byte) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO events (payload) VALUES (?)`, payload)
	return err
}
