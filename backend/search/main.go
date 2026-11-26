// Command search is the marketplace's product search service.
//
// It keeps the whole active catalogue in memory as an inverted index with
// BM25 ranking, typo tolerance, prefix matching for search-as-you-type and
// facet counts, and stays fresh by listening to Postgres notifications. It
// is internal only: the FastAPI service calls it and falls back to Postgres
// full text search if it is down. Never expose its port publicly.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	addr := envOr("LISTEN_ADDR", ":8080")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		slog.Error("bad DATABASE_URL", "err", err)
		os.Exit(1)
	}
	cfg.MaxConns = 4
	// Works through Supabase's transaction pooler too.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		slog.Error("db pool", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	loader := NewLoader(pool, dsn)
	for i := 0; i < 30; i++ {
		if err = loader.Reload(ctx); err == nil {
			break
		}
		slog.Warn("initial load failed, retrying", "err", err)
		time.Sleep(2 * time.Second)
	}
	go loader.Run(ctx)

	srv := &http.Server{
		Addr:              addr,
		Handler:           routes(loader),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	slog.Info("search listening", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

var sorts = map[string]bool{"relevance": true, "price_asc": true, "price_desc": true, "newest": true, "rating": true, "popular": true}

func routes(l *Loader) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		idx := l.Index()
		writeJSON(w, 200, map[string]any{"ok": true, "products": len(idx.docs), "built_at": idx.builtAt})
	})
	mux.HandleFunc("GET /search", func(w http.ResponseWriter, r *http.Request) {
		q, err := parseQuery(r, l)
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		if q == nil { // unknown category: nothing can match
			writeJSON(w, 200, Result{IDs: []string{}, Facets: map[string][]Facet{}})
			return
		}
		writeJSON(w, 200, l.Index().Search(*q))
	})
	mux.HandleFunc("GET /suggest", func(w http.ResponseWriter, r *http.Request) {
		text := strings.TrimSpace(r.URL.Query().Get("q"))
		if text == "" || len(text) > 80 {
			writeJSON(w, 400, map[string]string{"error": "q must be 1 to 80 characters"})
			return
		}
		limit := clampInt(r.URL.Query().Get("limit"), 8, 1, 10)
		writeJSON(w, 200, map[string]any{"suggestions": l.Index().Suggest(text, limit)})
	})
	return mux
}

func parseQuery(r *http.Request, l *Loader) (*Query, error) {
	v := r.URL.Query()
	q := &Query{
		Text:     strings.TrimSpace(v.Get("q")),
		Store:    v.Get("store"),
		Brand:    v.Get("brand"),
		Sort:     v.Get("sort"),
		Page:     clampInt(v.Get("page"), 1, 1, 1000),
		PageSize: clampInt(v.Get("page_size"), 24, 1, 100),
	}
	if len(q.Text) > 120 || len(q.Store) > 80 || len(q.Brand) > 80 {
		return nil, errors.New("parameter too long")
	}
	if q.Sort == "" {
		q.Sort = "relevance"
	}
	if !sorts[q.Sort] {
		return nil, errors.New("unknown sort")
	}
	if c := v.Get("category"); c != "" {
		id, ok := l.CategoryID(c)
		if !ok {
			return nil, nil
		}
		q.CategoryID = id
	}
	for key, dst := range map[string]**int64{"min_price": &q.MinPrice, "max_price": &q.MaxPrice} {
		if s := v.Get(key); s != "" {
			n, err := strconv.ParseInt(s, 10, 64)
			if err != nil || n < 0 {
				return nil, errors.New(key + " must be a non-negative integer")
			}
			*dst = &n
		}
	}
	return q, nil
}

func clampInt(s string, def, lo, hi int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < lo {
		return lo
	}
	if n > hi {
		return hi
	}
	return n
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
